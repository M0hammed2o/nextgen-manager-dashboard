import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OfflineSalesReviewPage from './OfflineSalesReviewPage';
import { apiClient } from '@/lib/api-client';
import type { FlaggedOfflineOrder } from '@/lib/offline-review';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() } };
});

let mockRole = 'OWNER';
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: null, staff_name: 'Me', role: mockRole, business_id: 'b1', business_name: 'Biz' } }),
}));

const BASE = '/v1/business/pos/offline-orders/flagged';

function order(over: Partial<FlaggedOfflineOrder>): FlaggedOfflineOrder {
  return {
    id: 'o1', order_number: '1001', total_cents: 5000, payment_method: 'CASH',
    offline_captured_at: '2026-11-10T09:00:00Z', offline_synced_at: '2026-11-10T20:00:00Z',
    created_by_user_id: 's1', offline_synced_by_user_id: 's1', till_session_id: null,
    offline_unattributed: false, offline_late_to_closed_till: false, offline_stock_shortfall: false,
    offline_client_total_cents: null, offline_price_variance_cents: null,
    review_reasons: ['late_sync'], offline_acknowledged_at: null, offline_acknowledged_by_user_id: null,
    ...over,
  };
}

const ROWS = [
  order({ id: 'o1', order_number: '1001', review_reasons: ['capture_day_unpaid_at_sync', 'cashier_differs_from_syncer'] }),
  order({ id: 'o2', order_number: '1002', review_reasons: ['variance', 'unattributed'], offline_price_variance_cents: 2500 }),
];

function mockApi(rows: FlaggedOfflineOrder[] | Error = ROWS) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url.startsWith(BASE)) {
      if (rows instanceof Error) throw rows;
      return rows as never;
    }
    if (url === '/v1/business/staff') {
      return [{ id: 's1', staff_name: 'Thandi', email: null, role: 'STAFF', is_active: true }] as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><OfflineSalesReviewPage /></QueryClientProvider>);
}

function listCalls() {
  return vi.mocked(apiClient.get).mock.calls.filter(([u]) => String(u).startsWith(BASE)).length;
}

describe('OfflineSalesReviewPage', () => {
  beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => { vi.clearAllMocks(); mockRole = 'OWNER'; });

  it('shows reason chips, plain-language explanations, cashier name and the owner-refund note', async () => {
    mockApi();
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('offline-row')).toHaveLength(2));
    const rows = screen.getAllByTestId('offline-row');
    expect(within(rows[0]).getByText('Unpaid day at sync')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Cashier differs')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Synced on a day this stall had not paid for.')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Cashier differs from the person who synced.')).toBeInTheDocument();
    await waitFor(() => expect(within(rows[0]).getByText('Thandi')).toBeInTheDocument());
    expect(within(rows[1]).getByText(/differed from the system price by .*25[.,]00/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('No till session was open at the time of sale.')).toBeInTheDocument();
    expect(screen.getByText(/need the owner/i)).toBeInTheDocument();
  });

  it('owner gets enabled Mark reviewed buttons', async () => {
    mockApi();
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Mark reviewed' });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toBeEnabled());
  });

  it('manager sees the list but only disabled actions plus an explanation', async () => {
    mockRole = 'MANAGER';
    mockApi();
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Mark reviewed' });
    buttons.forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByText(/Only the owner can mark a sale as reviewed\./)).toBeInTheDocument();
    fireEvent.click(buttons[0]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('acknowledge asks for confirmation, then POSTs the right endpoint and refreshes the list', async () => {
    mockApi();
    vi.mocked(apiClient.post).mockResolvedValue({} as never);
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Mark reviewed' });
    fireEvent.click(buttons[1]);

    const dialog = await screen.findByRole('alertdialog');
    expect(apiClient.post).not.toHaveBeenCalled(); // nothing before confirming
    const before = listCalls();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark reviewed' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/pos/offline-orders/o2/acknowledge'));
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });

  it('cancelling the confirmation does not call the API', async () => {
    mockApi();
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Mark reviewed' }))[0]);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('filters: reason select and show-reviewed switch build the right query', async () => {
    mockApi();
    renderPage();
    await screen.findAllByTestId('offline-row');
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}?limit=100`);

    fireEvent.click(screen.getByText('All reasons').closest('button')!);
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Synced late'));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(`${BASE}?reason=late_sync&limit=100`));

    fireEvent.click(screen.getByLabelText('Show reviewed'));
    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(`${BASE}?reason=late_sync&include_acknowledged=true&limit=100`));
  });

  it('shows reviewed rows without an action', async () => {
    mockApi([order({
      id: 'o3', order_number: '1003',
      offline_acknowledged_at: '2026-11-11T08:00:00Z', offline_acknowledged_by_user_id: 's1',
    })]);
    renderPage();
    await screen.findByText('#1003');
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).not.toBeInTheDocument();
    expect(screen.getByText(/Reviewed/)).toBeInTheDocument();
  });

  it('empty state when nothing is flagged', async () => {
    mockApi([]);
    renderPage();
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });

  it('error state with retry, distinct from empty', async () => {
    mockApi(new Error('boom'));
    renderPage();
    expect(await screen.findByText("Couldn't load this page")).toBeInTheDocument();
    expect(screen.queryByText('Nothing to review')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
