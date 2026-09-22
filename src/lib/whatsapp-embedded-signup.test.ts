import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  parseEmbeddedSignupMessage,
  loadMetaSdk,
  fbLogin,
  launchEmbeddedSignup,
  __resetMetaSdkStateForTests,
} from './whatsapp-embedded-signup';
import type { WhatsAppConnectConfig, WhatsAppExchangeResponse } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, post: vi.fn() },
  };
});

const AVAILABLE_CONFIG: WhatsAppConnectConfig = {
  available: true,
  reason: null,
  app_id: 'app123',
  config_id: 'cfg123',
  graph_version: 'v21.0',
};

function fbMessageEvent(overrides: {
  origin?: string;
  event?: string;
  type?: string;
  data?: unknown;
} = {}) {
  return new MessageEvent('message', {
    origin: overrides.origin ?? 'https://www.facebook.com',
    data: {
      type: overrides.type ?? 'WA_EMBEDDED_SIGNUP',
      event: overrides.event ?? 'FINISH',
      data: overrides.data ?? { waba_id: 'waba-1', phone_number_id: 'phone-1' },
    },
  });
}

function exchangeResponse(overrides: Partial<WhatsAppExchangeResponse> = {}): WhatsAppExchangeResponse {
  return {
    success: true,
    failed_step: null,
    message: 'Connected.',
    connection: {
      connected: true,
      status: 'CONNECTED',
      status_reason: null,
      waba_id: 'waba-1',
      display_phone_number: '+27821234567',
      verified_name: 'My Restaurant',
      webhook_subscribed: true,
      phone_registered: true,
      quality_rating: 'GREEN',
      messaging_limit_tier: null,
      connected_at: '2026-09-22T00:00:00Z',
      disconnected_at: null,
      last_health_check_at: null,
      last_webhook_at: null,
      on_legacy_platform_path: false,
      whatsapp_module_enabled: true,
      whatsapp_paused: false,
    },
    ...overrides,
  };
}

describe('parseEmbeddedSignupMessage', () => {
  it('parses a valid FINISH message from a facebook.com origin', () => {
    const result = parseEmbeddedSignupMessage(fbMessageEvent());
    expect(result).toEqual({ type: 'finish', data: { wabaId: 'waba-1', phoneNumberId: 'phone-1' } });
  });

  it('parses FINISH_* variants (e.g. FINISH_ONBOARDING) as a terminal success', () => {
    const result = parseEmbeddedSignupMessage(fbMessageEvent({ event: 'FINISH_ONBOARDING' }));
    expect(result).toEqual({ type: 'finish', data: { wabaId: 'waba-1', phoneNumberId: 'phone-1' } });
  });

  it('parses CANCEL as a user-cancelled attempt', () => {
    const result = parseEmbeddedSignupMessage(fbMessageEvent({ event: 'CANCEL' }));
    expect(result).toEqual({ type: 'cancel' });
  });

  it('parses a stringified JSON payload the same as an object payload', () => {
    const event = new MessageEvent('message', {
      origin: 'https://www.facebook.com',
      data: JSON.stringify({
        type: 'WA_EMBEDDED_SIGNUP',
        event: 'FINISH',
        data: { waba_id: 'waba-1', phone_number_id: 'phone-1' },
      }),
    });
    expect(parseEmbeddedSignupMessage(event)).toEqual({
      type: 'finish',
      data: { wabaId: 'waba-1', phoneNumberId: 'phone-1' },
    });
  });

  it('rejects a wrong-origin event even with an otherwise valid payload', () => {
    expect(parseEmbeddedSignupMessage(fbMessageEvent({ origin: 'https://evil-example.com' }))).toBeNull();
  });

  it('rejects an event whose origin merely contains "facebook.com" as a substring, not a suffix', () => {
    expect(
      parseEmbeddedSignupMessage(fbMessageEvent({ origin: 'https://facebook.com.evil-example.com' }))
    ).toBeNull();
  });

  it('rejects a malformed payload with no "type" field', () => {
    const event = new MessageEvent('message', {
      origin: 'https://www.facebook.com',
      data: { event: 'FINISH', data: { waba_id: 'waba-1', phone_number_id: 'phone-1' } },
    });
    expect(parseEmbeddedSignupMessage(event)).toBeNull();
  });

  it('rejects a FINISH message missing waba_id/phone_number_id', () => {
    expect(parseEmbeddedSignupMessage(fbMessageEvent({ data: { waba_id: 'waba-1' } }))).toBeNull();
  });

  it('ignores an unrelated postMessage from the same origin (a non-terminal step change)', () => {
    expect(parseEmbeddedSignupMessage(fbMessageEvent({ event: 'STEP_CHANGE' }))).toBeNull();
  });
});

describe('launchEmbeddedSignup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMetaSdkStateForTests();
  });

  afterEach(() => {
    __resetMetaSdkStateForTests();
  });

  function callbacks() {
    return {
      onCancelled: vi.fn(),
      onUnavailable: vi.fn(),
      onExchangeResult: vi.fn(),
    };
  }

  it('surfaces config.available === false without calling any backend route', async () => {
    const cb = callbacks();
    await launchEmbeddedSignup(
      { available: false, reason: 'Not configured yet.', app_id: null, config_id: null, graph_version: null },
      cb,
    );
    expect(cb.onUnavailable).toHaveBeenCalledWith('Not configured yet.');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('calls POST /connection/start, then passes the exact returned state unmodified to /connection/exchange (message arrives before the FB.login code)', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-abc-123', expires_in: 600 });
      }
      if (path === '/v1/business/whatsapp/connection/exchange') {
        return Promise.resolve(exchangeResponse());
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });

    window.FB = {
      init: vi.fn(),
      login: vi.fn((cb) => {
        // Message arrives first (as the popup posts it while closing)...
        window.dispatchEvent(fbMessageEvent());
        // ...then the SDK's own callback resolves shortly after.
        setTimeout(() => cb({ authResponse: { code: 'code-xyz' } }), 0);
      }),
    };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/v1/business/whatsapp/connection/start');
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/v1/business/whatsapp/connection/exchange', {
      state: 'state-abc-123',
      code: 'code-xyz',
      waba_id: 'waba-1',
      phone_number_id: 'phone-1',
    });
    expect(cb.onExchangeResult).toHaveBeenCalledWith(exchangeResponse());
    expect(cb.onCancelled).not.toHaveBeenCalled();
    expect(cb.onUnavailable).not.toHaveBeenCalled();
  });

  it('fires the exchange the same way when the FB.login code arrives before the message (order-independent)', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-def-456', expires_in: 600 });
      }
      if (path === '/v1/business/whatsapp/connection/exchange') {
        return Promise.resolve(exchangeResponse());
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });

    window.FB = {
      init: vi.fn(),
      login: vi.fn((cb) => {
        cb({ authResponse: { code: 'code-first' } });
        setTimeout(() => window.dispatchEvent(fbMessageEvent()), 0);
      }),
    };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/v1/business/whatsapp/connection/exchange', {
      state: 'state-def-456',
      code: 'code-first',
      waba_id: 'waba-1',
      phone_number_id: 'phone-1',
    });
    expect(cb.onExchangeResult).toHaveBeenCalledTimes(1);
  });

  it('shows a clear, specific message and does not claim success on INVALID_OR_EXPIRED_STATE', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-abc', expires_in: 600 });
      }
      if (path === '/v1/business/whatsapp/connection/exchange') {
        return Promise.reject(new ApiError('Expired or reused state', 401, 'INVALID_OR_EXPIRED_STATE'));
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });

    window.FB = {
      init: vi.fn(),
      login: vi.fn((cb) => {
        window.dispatchEvent(fbMessageEvent());
        cb({ authResponse: { code: 'code-xyz' } });
      }),
    };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(cb.onUnavailable).toHaveBeenCalledWith(
      expect.stringMatching(/expired or was already used/i)
    );
    expect(cb.onExchangeResult).not.toHaveBeenCalled();
  });

  it('degrades gracefully when the Meta SDK script fails to load, without ever attempting /connection/exchange', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-abc', expires_in: 600 });
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });
    // No window.FB — forces loadMetaSdk to insert a fresh <script> tag.
    delete window.FB;

    const cb = callbacks();
    const launchPromise = launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    const script = await waitFor(() => {
      const el = document.getElementById('facebook-jssdk');
      if (!el) throw new Error('script tag not inserted yet');
      return el;
    });
    script.dispatchEvent(new Event('error'));

    await launchPromise;

    expect(cb.onUnavailable).toHaveBeenCalledWith(expect.stringMatching(/could not load/i));
    expect(apiClient.post).not.toHaveBeenCalledWith(
      '/v1/business/whatsapp/connection/exchange',
      expect.anything(),
    );
  });

  it('degrades gracefully when the popup is blocked (FB.login throws synchronously)', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-abc', expires_in: 600 });
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });
    window.FB = {
      init: vi.fn(),
      login: vi.fn(() => {
        throw new Error('Popup blocked by the browser');
      }),
    };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(cb.onUnavailable).toHaveBeenCalledWith(expect.stringMatching(/blocked/i));
    expect(cb.onCancelled).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalledWith(
      '/v1/business/whatsapp/connection/exchange',
      expect.anything(),
    );
  });

  it('treats a CANCEL message as a silent user-cancelled attempt, not an error', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-abc', expires_in: 600 });
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });
    window.FB = {
      init: vi.fn(),
      login: vi.fn(() => {
        window.dispatchEvent(fbMessageEvent({ event: 'CANCEL' }));
        // FB.login's own callback deliberately never fires in this scenario
        // (the popup closed itself after posting CANCEL).
      }),
    };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(cb.onCancelled).toHaveBeenCalledTimes(1);
    expect(cb.onUnavailable).not.toHaveBeenCalled();
    expect(cb.onExchangeResult).not.toHaveBeenCalled();
  });

  it('treats FB.login resolving with no authResponse (popup closed without finishing) as cancelled', async () => {
    vi.mocked(apiClient.post).mockImplementation((path: string) => {
      if (path === '/v1/business/whatsapp/connection/start') {
        return Promise.resolve({ state: 'state-abc', expires_in: 600 });
      }
      return Promise.reject(new Error(`unexpected POST ${path}`));
    });
    window.FB = {
      init: vi.fn(),
      login: vi.fn((cb) => cb({})),
    };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(cb.onCancelled).toHaveBeenCalledTimes(1);
    expect(cb.onUnavailable).not.toHaveBeenCalled();
  });

  it('surfaces a friendly message and never opens the popup if /connection/start itself fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('Server error', 500));
    window.FB = { init: vi.fn(), login: vi.fn() };

    const cb = callbacks();
    await launchEmbeddedSignup(AVAILABLE_CONFIG, cb);

    expect(cb.onUnavailable).toHaveBeenCalledWith('Server error');
    expect(window.FB.login).not.toHaveBeenCalled();
  });
});

describe('loadMetaSdk', () => {
  beforeEach(() => {
    __resetMetaSdkStateForTests();
  });
  afterEach(() => {
    __resetMetaSdkStateForTests();
  });

  it('resolves immediately if window.FB is already present (no duplicate script insertion)', async () => {
    window.FB = { init: vi.fn(), login: vi.fn() };
    await expect(loadMetaSdk('app1', 'v21.0')).resolves.toBeUndefined();
    expect(document.getElementById('facebook-jssdk')).toBeNull();
  });

  it('reuses the same in-flight promise for a second concurrent call instead of inserting a second <script> tag', () => {
    const p1 = loadMetaSdk('app1', 'v21.0');
    const p2 = loadMetaSdk('app1', 'v21.0');
    expect(p1).toBe(p2);
    expect(document.querySelectorAll('#facebook-jssdk').length).toBe(1);
  });
});

describe('fbLogin', () => {
  afterEach(() => {
    __resetMetaSdkStateForTests();
  });

  it('rejects when the SDK has not been loaded', async () => {
    delete window.FB;
    await expect(fbLogin('cfg1')).rejects.toThrow(/not loaded/i);
  });
});
