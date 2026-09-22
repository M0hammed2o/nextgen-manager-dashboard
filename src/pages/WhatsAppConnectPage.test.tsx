import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WhatsAppConnectPage from './WhatsAppConnectPage';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings, WhatsAppConnectConfig, WhatsAppConnection } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  };
});

let mockRole = 'OWNER';
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: null, staff_name: 'Test Owner', role: mockRole, business_id: 'b1', business_name: 'Test Biz' } }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const ENABLED_SETTINGS = { is_whatsapp_enabled: true } as unknown as BusinessSettings;
const DISABLED_SETTINGS = { is_whatsapp_enabled: false } as unknown as BusinessSettings;

const UNAVAILABLE_CONFIG: WhatsAppConnectConfig = {
  available: false,
  reason: 'WhatsApp Embedded Signup is not configured on this platform yet. Contact NextGen support.',
  app_id: null,
  config_id: null,
  graph_version: null,
};

const AVAILABLE_CONFIG: WhatsAppConnectConfig = {
  available: true,
  reason: null,
  app_id: 'app123',
  config_id: 'cfg123',
  graph_version: 'v21.0',
};

function connection(overrides: Partial<WhatsAppConnection> = {}): WhatsAppConnection {
  return {
    connected: false,
    status: 'NOT_CONNECTED',
    status_reason: null,
    waba_id: null,
    display_phone_number: null,
    verified_name: null,
    webhook_subscribed: false,
    phone_registered: false,
    quality_rating: null,
    messaging_limit_tier: null,
    connected_at: null,
    disconnected_at: null,
    last_health_check_at: null,
    last_webhook_at: null,
    on_legacy_platform_path: false,
    whatsapp_module_enabled: true,
    whatsapp_paused: false,
    ...overrides,
  };
}

function mockGet(map: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path in map) return Promise.resolve(map[path]);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('WhatsAppConnectPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockRole = 'OWNER';
  });

  it('shows a graceful module-not-enabled state and never calls the connection endpoints when is_whatsapp_enabled is false', async () => {
    mockGet({ '/v1/business/settings': DISABLED_SETTINGS });
    renderWithClient(<WhatsAppConnectPage />);

    await waitFor(() => expect(screen.getByText(/whatsapp ordering isn't enabled/i)).toBeInTheDocument());
    expect(apiClient.get).not.toHaveBeenCalledWith('/v1/business/whatsapp/connection/config');
    expect(apiClient.get).not.toHaveBeenCalledWith('/v1/business/whatsapp/connection');
  });

  it('shows the graceful "not available" message (not an error) when config.available is false', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/whatsapp/connection/config': UNAVAILABLE_CONFIG,
      '/v1/business/whatsapp/connection': connection(),
    });
    renderWithClient(<WhatsAppConnectPage />);

    await waitFor(() => expect(screen.getByText(/isn't set up on this platform yet/i)).toBeInTheDocument());
    expect(screen.getByText(UNAVAILABLE_CONFIG.reason!)).toBeInTheDocument();
    // No connect button should render at all — nothing to click that would fail.
    expect(screen.queryByRole('button', { name: /connect whatsapp/i })).not.toBeInTheDocument();
  });

  it('shows a working Connect button for the owner when available and not connected', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/whatsapp/connection/config': AVAILABLE_CONFIG,
      '/v1/business/whatsapp/connection': connection({ status: 'NOT_CONNECTED' }),
    });
    renderWithClient(<WhatsAppConnectPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /connect whatsapp/i })).toBeInTheDocument());
  });

  it('hides the Connect button and shows an owner-only message for a MANAGER', async () => {
    mockRole = 'MANAGER';
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/whatsapp/connection/config': AVAILABLE_CONFIG,
      '/v1/business/whatsapp/connection': connection({ status: 'NOT_CONNECTED' }),
    });
    renderWithClient(<WhatsAppConnectPage />);

    await waitFor(() => expect(screen.getByText(/only the account owner can connect whatsapp/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /connect whatsapp/i })).not.toBeInTheDocument();
  });

  it('renders connected details, and the pause/resume toggle reads live bot status', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/whatsapp/connection/config': AVAILABLE_CONFIG,
      '/v1/business/whatsapp/connection': connection({
        status: 'CONNECTED',
        connected: true,
        display_phone_number: '+27821234567',
        verified_name: 'My Restaurant',
        webhook_subscribed: true,
        phone_registered: true,
        quality_rating: 'GREEN',
      }),
      '/v1/business/whatsapp/status': { paused: false, paused_at: null, paused_by_name: null, busy_text: null },
    });
    renderWithClient(<WhatsAppConnectPage />);

    await waitFor(() => expect(screen.getByText('My Restaurant')).toBeInTheDocument());
    expect(screen.getByText('+27821234567')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Bot running')).toBeInTheDocument());
  });

  it('shows the plain-English status_reason and a re-check action for NEEDS_ATTENTION', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/whatsapp/connection/config': AVAILABLE_CONFIG,
      '/v1/business/whatsapp/connection': connection({
        status: 'NEEDS_ATTENTION',
        status_reason: 'Meta reports this connection\'s token is no longer valid — reconnect required.',
      }),
    });
    renderWithClient(<WhatsAppConnectPage />);

    await waitFor(() =>
      expect(screen.getByText(/token is no longer valid/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /re-check connection/i })).toBeInTheDocument();
  });

  it('disconnect requires confirmation before calling DELETE', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/whatsapp/connection/config': AVAILABLE_CONFIG,
      '/v1/business/whatsapp/connection': connection({
        status: 'CONNECTED',
        connected: true,
        display_phone_number: '+27821234567',
      }),
      '/v1/business/whatsapp/status': { paused: false, paused_at: null, paused_by_name: null, busy_text: null },
    });
    vi.mocked(apiClient.delete).mockResolvedValue(connection({ status: 'DISCONNECTED' }));
    renderWithClient(<WhatsAppConnectPage />);

    const disconnectBtn = await screen.findByRole('button', { name: /^disconnect$/i });
    fireEvent.click(disconnectBtn);

    expect(apiClient.delete).not.toHaveBeenCalled();
    expect(await screen.findByText(/disconnect whatsapp\?/i)).toBeInTheDocument();

    // The confirmation dialog renders a second "Disconnect" button (the
    // AlertDialogAction) alongside the original card trigger — click the
    // last one, which is the dialog's confirm action.
    const allDisconnectButtons = screen.getAllByRole('button', { name: /^disconnect$/i });
    fireEvent.click(allDisconnectButtons[allDisconnectButtons.length - 1]);
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/v1/business/whatsapp/connection'));
  });
});
