import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventHomePage from './EventHomePage';
import { RootRoute } from '@/components/RootRoute';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});
// The restaurant dashboard has its own large test suite; keep this one about routing.
vi.mock('@/pages/Dashboard', () => ({ default: () => <p>restaurant dashboard</p> }));

type Level = 'NONE' | 'CONFIGURE' | 'TRADE';

function access(level: Level | null, reason: string | null, vendor = true, category = 'FOOD') {
  return {
    is_event_vendor: vendor,
    access_level: level,
    reason,
    events: vendor ? [{
      event_id: 'ev1', event_name: 'Durban Summer Souk', venue: 'The Precinct', timezone: 'Africa/Johannesburg',
      event_status: 'PUBLISHED', prep_days: 3, days: ['2026-12-05', '2026-12-06'], first_day: '2026-12-05',
      last_day: '2026-12-06', calendar_published: true, stall_code: 'F-12', category, vendor_status: 'ACTIVE',
      subscriptions: [],
    }] : [],
  };
}

const SETUP = {
  business_name: 'Tasty Bites',
  inventory_enabled: false,
  ready_to_trade: false,
  percent_complete: 40,
  steps: [
    { key: 'business', label: 'Business details', description: 'd', status: 'done', detail: 'Complete', count: 0, total: 0, required_to_trade: true, href: '/settings' },
    { key: 'menu', label: 'Menu', description: 'd', status: 'todo', detail: 'No menu items yet', count: 0, total: 0, required_to_trade: true, href: '/menu' },
    { key: 'staff', label: 'Staff', description: 'd', status: 'partial', detail: '1 account', count: 1, total: 0, required_to_trade: true, href: '/staff' },
  ],
};

function mockApi(acc: ReturnType<typeof access>, subs: unknown = { events: [] }) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/v1/business/event-access') return acc as never;
    if (url === '/v1/business/setup/progress') return SETUP as never;
    if (url === '/v1/business/settings') return { name: 'Tasty Bites', logo_url: null } as never;
    if (url === '/v1/business/event-subscriptions') return subs as never;
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderAt(ui: React.ReactElement, path = '/event') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EventHomePage', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the checklist for an event vendor, reusing live setup statuses', async () => {
    mockApi(access('CONFIGURE', 'PREP_WINDOW'));
    renderAt(<EventHomePage />);

    const list = await screen.findByRole('list', { name: 'Event checklist' });
    expect(within(list).getByText('Business details')).toBeInTheDocument();
    expect(within(list).getByText('Logo')).toBeInTheDocument();
    expect(within(list).getByText('Menu')).toBeInTheDocument();
    expect(within(list).getByText('Staff and till PIN')).toBeInTheDocument();
    expect(within(list).getByText('Choose your event days')).toBeInTheDocument();
    expect(within(list).getByText('Pay for your days')).toBeInTheDocument();
    expect(within(list).getByText('Test your till')).toBeInTheDocument();
    // Statuses come from the server, not hardcoded.
    await screen.findByText('No menu items yet');
    expect(screen.getByText('1 account')).toBeInTheDocument();
    expect(screen.getByText('No days chosen yet')).toBeInTheDocument();
    expect(screen.getByText('Durban Summer Souk')).toBeInTheDocument();
  });

  it('shows the clothing note about sizes and colours only for a clothing vendor', async () => {
    mockApi(access('CONFIGURE', 'PREP_WINDOW', true, 'CLOTHING'));
    renderAt(<EventHomePage />);
    expect(await screen.findByText(/Sizes and colours as variants are coming soon/)).toBeInTheDocument();
    expect(screen.getByText('Catalogue')).toBeInTheDocument();
  });

  it('does not show the clothing note for a food vendor', async () => {
    mockApi(access('CONFIGURE', 'PREP_WINDOW'));
    renderAt(<EventHomePage />);
    await screen.findByText('Choose your event days');
    expect(screen.queryByText(/Sizes and colours/)).not.toBeInTheDocument();
  });

  it('marks days and payment from the subscriptions', async () => {
    mockApi(access('TRADE', 'PAID_DAY'), {
      events: [{
        event_id: 'ev1', subscriptions: [
          { id: 's1', starts_on: '2026-12-05', ends_on: '2026-12-06', billable_days: 2, day_rate_cents: 1, amount_cents: 2, status: 'UNPAID', paid_at: null, payment_claim_reference: 'REF1', payment_claimed_at: 'x' },
        ],
      }],
    });
    renderAt(<EventHomePage />);
    expect(await screen.findByText('1 subscription chosen')).toBeInTheDocument();
    expect(screen.getByText('1 payment awaiting confirmation')).toBeInTheDocument();
  });

  it.each([
    ['CONFIGURE', 'PREP_WINDOW', /Set-up mode/, /selling opens on your paid days/i],
    ['TRADE', 'PAID_DAY', /Trading open today/, /covered by a paid subscription/i],
    ['NONE', 'EVENT_ENDED', /Not open right now/, /The event has ended/],
  ] as const)('shows the %s access banner', async (level, reason, title, text) => {
    mockApi(access(level, reason));
    renderAt(<EventHomePage />);
    const banner = await screen.findByTestId('event-access-banner');
    expect(banner).toHaveAttribute('data-level', level);
    expect(banner).toHaveTextContent(title);
    expect(banner).toHaveTextContent(text);
  });

  function withWhatsApp(state: string, extra: Record<string, unknown> = {}) {
    return {
      ...access('TRADE', 'PAID_DAY'),
      ready_notify_available: state === 'READY',
      whatsapp: {
        state, whatsapp_enabled: state !== 'AWAITING_ADMIN_APPROVAL', connection_status: null,
        template_name: null, template_language: null, template_approved: state === 'READY',
        suggested_template: {
          name: 'order_ready_v1', language: 'en_US', category: 'UTILITY',
          body: 'Hi! Your order {{1}} from {{2}} is ready for collection at {{3}}.',
        },
        ...extra,
      },
    };
  }

  it('shows WhatsApp as awaiting NextGen approval, with no connect button', async () => {
    mockApi(withWhatsApp('AWAITING_ADMIN_APPROVAL') as never);
    renderAt(<EventHomePage />);
    expect(await screen.findByTestId('event-whatsapp-status')).toHaveTextContent(/awaiting NextGen approval/);
    expect(screen.queryByRole('link', { name: /Connect WhatsApp/ })).toBeNull();
  });

  it('links an approved but unconnected vendor to the existing WhatsApp connection page', async () => {
    mockApi(withWhatsApp('NOT_CONNECTED') as never);
    renderAt(<EventHomePage />);
    const link = await screen.findByRole('link', { name: /Connect WhatsApp/ });
    expect(link).toHaveAttribute('href', '/settings/whatsapp');
    expect(screen.getByText(/Meta bills you directly/)).toBeInTheDocument();
  });

  it('shows the template to submit while it is pending', async () => {
    mockApi(withWhatsApp('TEMPLATE_PENDING', { template_name: 'order_ready_v1' }) as never);
    renderAt(<EventHomePage />);
    const box = await screen.findByTestId('event-whatsapp-template');
    expect(within(box).getByText('order_ready_v1')).toBeInTheDocument();
    expect(within(box).getByText('Utility')).toBeInTheDocument();
    expect(within(box).getByText(/is ready for collection at \{\{3\}\}/)).toBeInTheDocument();
    expect(within(box).getByText(/waiting for NextGen to confirm/)).toBeInTheDocument();
  });

  it('shows WhatsApp ready, without the checklist counting it', async () => {
    mockApi(withWhatsApp('READY') as never);
    renderAt(<EventHomePage />);
    expect(await screen.findByTestId('event-whatsapp-status')).toHaveTextContent('Ready');
    expect(screen.queryByTestId('event-whatsapp-template')).toBeNull();
    const list = await screen.findByRole('list', { name: 'Event checklist' });
    expect(within(list).queryByText(/WhatsApp/)).toBeNull();
  });

  it('shows no WhatsApp card when the backend does not report it', async () => {
    mockApi(access('TRADE', 'PAID_DAY'));
    renderAt(<EventHomePage />);
    await screen.findByRole('list', { name: 'Event checklist' });
    expect(screen.queryByTestId('event-whatsapp-card')).toBeNull();
  });

  it('does not show the event checklist to a restaurant tenant', async () => {
    mockApi(access(null, null, false));
    renderAt(<EventHomePage />);
    expect(await screen.findByText('This business is not an event vendor')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Event checklist' })).not.toBeInTheDocument();
  });

  it('shows an error with retry when event access cannot be loaded', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
    renderAt(<EventHomePage />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('RootRoute', () => {
  afterEach(() => vi.clearAllMocks());

  function renderRoot() {
    return renderAt(
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/event" element={<p>event home</p>} />
      </Routes>,
      '/',
    );
  }

  it('sends an event vendor from / to the event home', async () => {
    mockApi(access('CONFIGURE', 'PREP_WINDOW'));
    renderRoot();
    expect(await screen.findByText('event home')).toBeInTheDocument();
  });

  it('keeps a restaurant tenant on the dashboard', async () => {
    mockApi(access(null, null, false));
    renderRoot();
    expect(await screen.findByText('restaurant dashboard')).toBeInTheDocument();
  });

  it('falls back to the dashboard if the event lookup fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
    renderRoot();
    expect(await screen.findByText('restaurant dashboard')).toBeInTheDocument();
  });
});
