import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import EventDaysPage from './EventDaysPage';
import { apiClient, ApiError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1', starts_on: '2026-12-05', ends_on: '2026-12-05', billable_days: 1, day_rate_cents: 150000,
  amount_cents: 150000, status: 'UNPAID', paid_at: null, payment_claim_reference: null, payment_claimed_at: null,
  ...over,
});

function eventsPayload(subscriptions: unknown[] = [], over: Record<string, unknown> = {}) {
  return {
    events: [{
      event_id: 'ev1', event_name: 'Durban Summer Souk', venue: 'The Precinct', timezone: 'Africa/Johannesburg',
      event_status: 'PUBLISHED', vendor_status: 'ACTIVE', category: 'FOOD', can_subscribe: true,
      // Dec 8 is deliberately absent: a non-billable gap day.
      quote_options: { day_rate_cents: 150000, billable_days: ['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-09'], billable_day_count: 4 },
      subscriptions,
      ...over,
    }],
  };
}

function mockApi(payload: unknown) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/v1/business/event-subscriptions') return payload as never;
    if (url === '/v1/business/event-access') {
      return { is_event_vendor: true, access_level: 'CONFIGURE', reason: 'PREP_WINDOW', events: [] } as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><EventDaysPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const dayButton = (name: RegExp) => screen.getByRole('button', { name });

describe('EventDaysPage - day picker and quote', () => {
  afterEach(() => vi.clearAllMocks());

  it('offers only billable days (the non-billable gap day is not pickable)', async () => {
    mockApi(eventsPayload());
    renderPage();
    await screen.findByRole('button', { name: /5 Dec 2026/ });
    expect(screen.getAllByRole('button', { name: /Dec 2026/ })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /8 Dec 2026/ })).not.toBeInTheDocument();
  });

  it('shows a labelled estimate, then creates the quote with the right body and shows the API amount', async () => {
    mockApi(eventsPayload());
    vi.mocked(apiClient.post).mockResolvedValue(sub({
      id: 'new1', starts_on: '2026-12-05', ends_on: '2026-12-09', billable_days: 4, amount_cents: 600000,
    }) as never);
    renderPage();
    await screen.findByRole('button', { name: /5 Dec 2026/ });

    fireEvent.click(dayButton(/5 Dec 2026/));
    fireEvent.click(dayButton(/9 Dec 2026/));
    // 4 billable days in 5..9 (the gap day is not counted) x R1 500.
    const estimate = screen.getByTestId('estimate');
    expect(estimate).toHaveTextContent(/Estimate/);
    expect(estimate).toHaveTextContent(/4 days/);
    expect(estimate).toHaveTextContent(/6\s?000,00/);

    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/event-subscriptions', {
      event_id: 'ev1', starts_on: '2026-12-05', ends_on: '2026-12-09',
    }));
    // The figure shown after creating is the API's amount.
    expect(await screen.findByTestId('last-quote')).toHaveTextContent(/6\s?000,00/);
  });

  it('a single tapped day is a one-day range, and tapping backwards still orders start/end', async () => {
    mockApi(eventsPayload());
    vi.mocked(apiClient.post).mockResolvedValue(sub() as never);
    renderPage();
    await screen.findByRole('button', { name: /5 Dec 2026/ });
    fireEvent.click(dayButton(/7 Dec 2026/));
    fireEvent.click(dayButton(/5 Dec 2026/));
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/event-subscriptions', {
      event_id: 'ev1', starts_on: '2026-12-05', ends_on: '2026-12-07',
    }));
  });

  it('disables days already covered by a live subscription but not a cancelled one', async () => {
    mockApi(eventsPayload([sub({ id: 'a', starts_on: '2026-12-05', ends_on: '2026-12-06' }),
      sub({ id: 'b', starts_on: '2026-12-07', ends_on: '2026-12-07', status: 'VOID' })]));
    renderPage();
    await screen.findByRole('button', { name: /5 Dec 2026/ });
    expect(dayButton(/5 Dec 2026/)).toBeDisabled();
    expect(dayButton(/6 Dec 2026/)).toBeDisabled();
    expect(dayButton(/7 Dec 2026/)).not.toBeDisabled();
  });

  it('disables Create quote until days are chosen', async () => {
    mockApi(eventsPayload());
    renderPage();
    await screen.findByRole('button', { name: /5 Dec 2026/ });
    expect(screen.getByRole('button', { name: 'Create quote' })).toBeDisabled();
  });

  it('shows a friendly message for an overlap conflict from the API', async () => {
    mockApi(eventsPayload());
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('overlap', 409, 'OVERLAPS_EXISTING'));
    renderPage();
    await screen.findByRole('button', { name: /5 Dec 2026/ });
    fireEvent.click(dayButton(/5 Dec 2026/));
    fireEvent.click(screen.getByRole('button', { name: 'Create quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/overlap a subscription you already have/i);
  });

  it('explains when the calendar is not published (no picker)', async () => {
    mockApi(eventsPayload([], {
      can_subscribe: false,
      quote_options: { day_rate_cents: 150000, billable_days: [], billable_day_count: 0 },
    }));
    renderPage();
    expect(await screen.findByText(/calendar has not been published yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create quote' })).not.toBeInTheDocument();
  });

  it('shows an error with retry if the page cannot load', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('says plainly that bank details are not configured, never a raw placeholder (e2e finding)', async () => {
    mockApi(eventsPayload());
    renderPage();
    const card = await screen.findByTestId('eft-instructions');
    expect(card).toHaveTextContent(/Bank details are not yet configured/);
    expect(card).toHaveTextContent(/Contact the event organiser/);
    expect(card).not.toHaveTextContent(/PLACEHOLDER|\[/);
  });
});

describe('EventDaysPage - subscriptions and payment claim', () => {
  afterEach(() => vi.clearAllMocks());

  it('distinguishes awaiting payment, claimed-awaiting-confirmation, and paid', async () => {
    mockApi(eventsPayload([
      sub({ id: 'u1', starts_on: '2026-12-05', ends_on: '2026-12-05' }),
      sub({ id: 'c1', starts_on: '2026-12-06', ends_on: '2026-12-06', payment_claim_reference: 'EFT-998', payment_claimed_at: '2026-11-20T10:00:00Z' }),
      sub({ id: 'p1', starts_on: '2026-12-07', ends_on: '2026-12-07', status: 'PAID', paid_at: '2026-11-21T10:00:00Z' }),
    ]));
    renderPage();
    const unpaid = await screen.findByTestId('subscription-u1');
    expect(within(unpaid).getByText('Awaiting payment')).toBeInTheDocument();
    const claimed = screen.getByTestId('subscription-c1');
    expect(within(claimed).getByText('Claimed, awaiting confirmation')).toBeInTheDocument();
    expect(within(claimed).getByText('EFT-998')).toBeInTheDocument();
    const paid = screen.getByTestId('subscription-p1');
    expect(within(paid).getByText('Paid')).toBeInTheDocument();
    // Paid and claimed ones cannot be cancelled from here; only an unpaid one offers cancel+claim.
    expect(within(paid).queryByRole('button')).not.toBeInTheDocument();
  });

  it('submits the EFT reference to the payment-claim endpoint', async () => {
    mockApi(eventsPayload([sub({ id: 'u1' })]));
    vi.mocked(apiClient.post).mockResolvedValue({ ...sub({ id: 'u1', payment_claim_reference: 'EFT-1' }), already_claimed: false } as never);
    renderPage();
    const row = await screen.findByTestId('subscription-u1');
    fireEvent.click(within(row).getByRole('button', { name: /I've paid/ }));
    fireEvent.change(within(row).getByLabelText('EFT payment reference'), { target: { value: '  EFT-1 ' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Submit reference' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/event-subscriptions/u1/payment-claim', { reference: 'EFT-1' },
    ));
  });

  it('shows a clear message when the reference is already used', async () => {
    mockApi(eventsPayload([sub({ id: 'u1' })]));
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('used', 409, 'PAYMENT_REFERENCE_USED'));
    renderPage();
    const row = await screen.findByTestId('subscription-u1');
    fireEvent.click(within(row).getByRole('button', { name: /I've paid/ }));
    fireEvent.change(within(row).getByLabelText('EFT payment reference'), { target: { value: 'DUP' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Submit reference' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(/already used on another paid subscription/i);
  });

  it('cancels an unpaid quote after confirmation', async () => {
    mockApi(eventsPayload([sub({ id: 'u1' })]));
    vi.mocked(apiClient.post).mockResolvedValue(sub({ id: 'u1', status: 'VOID' }) as never);
    renderPage();
    const row = await screen.findByTestId('subscription-u1');
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel quote' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel quote' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/event-subscriptions/u1/cancel'));
  });
});
