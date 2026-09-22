import { apiClient, ApiError } from './api-client';
import type {
  WhatsAppConnectConfig, WhatsAppConnectStartResponse, WhatsAppExchangeResponse,
} from '@/types/api';

/**
 * Real Meta WhatsApp Embedded Signup handshake.
 *
 * The flow has two independent, order-agnostic signals that must both
 * arrive before we can call POST /connection/exchange:
 *   - `code`, returned via FB.login()'s own callback.
 *   - `waba_id`/`phone_number_id`, delivered separately via a
 *     `window.postMessage` from the popup (type "WA_EMBEDDED_SIGNUP").
 * Meta does not guarantee which arrives first, so this module tracks both
 * independently and fires the exchange the moment the second one lands
 * (see `launchEmbeddedSignup`'s internal `tryExchange`), rather than
 * assuming a fixed order.
 */

// ── Message-listener parsing (pure, unit-testable in isolation) ────────────

export interface EmbeddedSignupData {
  wabaId: string;
  phoneNumberId: string;
}

export type EmbeddedSignupMessage =
  | { type: 'finish'; data: EmbeddedSignupData }
  | { type: 'cancel' };

/**
 * Parses a `window` 'message' event that may or may not be Meta's WhatsApp
 * Embedded Signup payload. Returns `null` for anything that isn't a
 * recognised, well-formed signup message — including a wrong-origin event,
 * so a malicious/unrelated postMessage from another frame can never be
 * mistaken for a real Meta callback.
 */
export function parseEmbeddedSignupMessage(event: MessageEvent): EmbeddedSignupMessage | null {
  if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return null;

  let payload: unknown = event.data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;

  const msg = payload as Record<string, unknown>;
  if (msg.type !== 'WA_EMBEDDED_SIGNUP') return null;
  if (typeof msg.event !== 'string') return null;

  if (msg.event === 'CANCEL') return { type: 'cancel' };

  // Terminal success variants are all named FINISH / FINISH_* per Meta's docs.
  if (msg.event.startsWith('FINISH')) {
    const data = msg.data;
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const wabaId = d.waba_id;
    const phoneNumberId = d.phone_number_id;
    if (typeof wabaId !== 'string' || !wabaId) return null;
    if (typeof phoneNumberId !== 'string' || !phoneNumberId) return null;
    return { type: 'finish', data: { wabaId, phoneNumberId } };
  }

  // A non-terminal step-change event (e.g. a screen transition inside the
  // popup) — not an error, just nothing for the caller to act on yet.
  return null;
}

// ── Meta JS SDK loading ─────────────────────────────────────────────────────

type MetaFB = {
  init: (opts: Record<string, unknown>) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    opts: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: MetaFB;
    fbAsyncInit?: () => void;
  }
}

const SDK_SCRIPT_ID = 'facebook-jssdk';
let sdkLoadPromise: Promise<void> | null = null;

/**
 * Loads Meta's JS SDK exactly once per page session and resolves once
 * `FB.init` has run. Safe to call repeatedly (e.g. the owner opens/closes
 * the Connect flow more than once) — later calls reuse the same in-flight
 * or already-resolved promise instead of inserting a second `<script>` tag.
 * On load failure, resets internal state so a later retry (fresh click)
 * can attempt the load again rather than being stuck rejected forever.
 */
export function loadMetaSdk(appId: string, graphVersion: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: false, xfbml: false, version: graphVersion });
      resolve();
    };

    if (document.getElementById(SDK_SCRIPT_ID)) {
      // Already inserted by an earlier in-flight attempt this session; that
      // attempt's own onerror/fbAsyncInit owns the outcome.
      return;
    }

    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      script.remove();
      sdkLoadPromise = null;
      reject(new Error(
        'Could not load the Meta WhatsApp connect popup — check your connection or ad-blocker and try again.'
      ));
    };
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

/** Test-only: clears module-level SDK state between test cases. */
export function __resetMetaSdkStateForTests(): void {
  sdkLoadPromise = null;
  delete window.FB;
  delete window.fbAsyncInit;
  document.getElementById(SDK_SCRIPT_ID)?.remove();
}

// ── FB.login wrapper ─────────────────────────────────────────────────────

/**
 * Opens Meta's Embedded Signup popup via `FB.login`. Resolves with the
 * OAuth `code` on success, `null` if the popup was closed/cancelled without
 * completing, and rejects if the SDK isn't loaded or the popup itself could
 * not be opened at all (e.g. blocked by the browser) — `FB.login` throws
 * synchronously in that case in some browsers.
 */
export function fbLogin(configId: string): Promise<{ code: string } | null> {
  return new Promise((resolve, reject) => {
    if (!window.FB || typeof window.FB.login !== 'function') {
      reject(new Error('Meta SDK not loaded.'));
      return;
    }
    try {
      window.FB.login(
        (response) => {
          const code = response?.authResponse?.code;
          if (typeof code === 'string' && code) {
            resolve({ code });
          } else {
            resolve(null);
          }
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {} },
        },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Could not open the Meta connect popup.'));
    }
  });
}

// ── Orchestration ────────────────────────────────────────────────────────

export interface LaunchEmbeddedSignupCallbacks {
  /** User closed the popup or hit Cancel — not an error, just reset the UI. */
  onCancelled: () => void;
  /** Anything that stops the flow before/without a real outcome (SDK failed
   * to load, popup blocked, /start or /exchange failed, expired state). */
  onUnavailable: (message: string) => void;
  /** A real response from POST /connection/exchange — may itself carry
   * success:false; the caller renders that exactly like other page states. */
  onExchangeResult: (result: WhatsAppExchangeResponse) => void;
}

/**
 * Runs the full real Embedded Signup handshake:
 *   1. POST /connection/start — mint a single-use anti-CSRF state.
 *   2. Load the Meta JS SDK.
 *   3. Register the message listener, then open FB.login().
 *   4. The moment BOTH the OAuth `code` (from FB.login's callback) and the
 *      `waba_id`/`phone_number_id` (from the WA_EMBEDDED_SIGNUP message)
 *      have arrived, POST /connection/exchange with the held `state`
 *      unmodified alongside them.
 *
 * The minted `state` lives only in a local variable for the duration of
 * this call — never persisted to storage, matching its single-use/short-
 * lived nature.
 */
export async function launchEmbeddedSignup(
  config: WhatsAppConnectConfig,
  callbacks: LaunchEmbeddedSignupCallbacks,
): Promise<void> {
  if (!config.available || !config.app_id || !config.config_id) {
    callbacks.onUnavailable(
      config.reason ?? 'WhatsApp connect is not available on this platform yet.'
    );
    return;
  }

  let state: string;
  try {
    const started = await apiClient.post<WhatsAppConnectStartResponse>(
      '/v1/business/whatsapp/connection/start'
    );
    state = started.state;
  } catch (err) {
    callbacks.onUnavailable(
      err instanceof ApiError
        ? err.message
        : 'Could not start the WhatsApp connect flow right now — please try again.'
    );
    return;
  }

  try {
    await loadMetaSdk(config.app_id, config.graph_version ?? 'v21.0');
  } catch (err) {
    callbacks.onUnavailable(
      err instanceof Error
        ? err.message
        : 'Could not load the Meta WhatsApp connect popup — please try again.'
    );
    return;
  }

  const configId = config.config_id;

  await new Promise<void>((resolveFlow) => {
    let code: string | null = null;
    let signupData: EmbeddedSignupData | null = null;
    let settled = false;

    function cleanup() {
      window.removeEventListener('message', onMessage);
    }

    function finish() {
      if (settled) return;
      settled = true;
      cleanup();
      resolveFlow();
    }

    async function tryExchange() {
      if (settled || !code || !signupData) return;
      settled = true; // lock in now — the exchange is about to run
      cleanup();
      try {
        const result = await apiClient.post<WhatsAppExchangeResponse>(
          '/v1/business/whatsapp/connection/exchange',
          {
            state,
            code,
            waba_id: signupData.wabaId,
            phone_number_id: signupData.phoneNumberId,
          },
        );
        callbacks.onExchangeResult(result);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'INVALID_OR_EXPIRED_STATE') {
          callbacks.onUnavailable(
            'That connection attempt expired or was already used — please try again.'
          );
        } else {
          callbacks.onUnavailable(
            err instanceof ApiError
              ? err.message
              : 'Could not complete the WhatsApp connection — please try again.'
          );
        }
      } finally {
        resolveFlow();
      }
    }

    function onMessage(event: MessageEvent) {
      const parsed = parseEmbeddedSignupMessage(event);
      if (!parsed) return;
      if (parsed.type === 'cancel') {
        callbacks.onCancelled();
        finish();
        return;
      }
      signupData = parsed.data;
      void tryExchange();
    }

    window.addEventListener('message', onMessage);

    fbLogin(configId)
      .then((loginResult) => {
        if (settled) return;
        if (!loginResult) {
          callbacks.onCancelled();
          finish();
          return;
        }
        code = loginResult.code;
        void tryExchange();
      })
      .catch(() => {
        if (settled) return;
        callbacks.onUnavailable(
          'The Meta connect popup could not be opened — it may have been blocked. ' +
          'Allow popups for this site and try again.'
        );
        finish();
      });
  });
}
