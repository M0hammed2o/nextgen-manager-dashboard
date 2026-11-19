import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LateUploadsSection } from './LateUploadsSection';
import { OfflineReviewBadge } from '@/components/dashboard/OfflineReviewBadge';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  buildLateUploadsPath, lateUploadDecisionPath, pendingCountOf, reasonChipLabel, reasonExplanation,
  type LateUpload,
} from '@/lib/offline-review';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() } };
});

let mockRole = 'MANAGER';
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mockRole } }) }));

const LIST = '/v1/business/pos/offline-reviews?status=PENDING&limit=100';

function upload(over: Partial<LateUpload> = {}): LateUpload {
  return {
    id: 'r1', status: 'PENDING', idempotency_key: 'k1',
    captured_at: '2026-11-15T08:00:00Z', received_at: '2026-11-17T10:00:00Z',
    captured_by_user_id: 's1', captured_by_name: 'Thandi', synced_by_user_id: 's1', synced_by_name: 'Thandi',
    upload_review_reasons: ['post_event_grace_sync', 'late_sync'], payment_method: 'CASH',
    client_total_cents: 5000, discount_cents: 0,
    lines: [{ menu_item_id: 'm1', variant_id: null, quantity: 2, name: 'Lamb Wrap' }],
    decided_by_user_id: null, decided_by_name: null, decided_at: null, decision_note: null, order_id: null,
    ...over,
  };
}

function mockList(result: { items: LateUpload[]; pending_count: number } | Error) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === LIST) {
      if (result instanceof Error) throw result;
      return result as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><LateUploadsSection /></QueryClientProvider>);
}

const listCalls = () => vi.mocked(apiClient.get).mock.calls.filter(([u]) => u === LIST).length;

describe('LateUploadsSection', () => {
  afterEach(() => { vi.clearAllMocks(); mockRole = 'MANAGER'; });

  it('lists pending late uploads with lines, cashier, device total and readable reasons', async () => {
    mockList({ items: [upload()], pending_count: 1 });
    renderSection();
    const row = await screen.findByTestId('late-upload-row');
    expect(within(row).getByText('2 × Lamb Wrap')).toBeInTheDocument();
    expect(within(row).getByText('Thandi')).toBeInTheDocument();
    expect(within(row).getByText(/50[.,]00/)).toBeInTheDocument();
    expect(within(row).getByText('Uploaded after event')).toBeInTheDocument();
    expect(within(row).getByText('Synced late')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(LIST);
  });

  it('loading, then empty state', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    vi.mocked(apiClient.get).mockImplementation(() => new Promise((r) => { resolve = r; }) as never);
    renderSection();
    expect(screen.getByText(/Loading late uploads/)).toBeInTheDocument();
    resolve({ items: [], pending_count: 0 });
    expect(await screen.findByTestId('late-uploads-empty')).toHaveTextContent('No late uploads are waiting.');
  });

  it('error state with its own retry, distinct from empty', async () => {
    mockList(new Error('boom'));
    renderSection();
    expect(await screen.findByText(/Could not load late uploads/)).toBeInTheDocument();
    expect(screen.queryByTestId('late-uploads-empty')).not.toBeInTheDocument();
    const before = listCalls();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading late uploads' }));
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });

  it('approve needs a note, then POSTs it and refreshes the list', async () => {
    mockList({ items: [upload()], pending_count: 1 });
    vi.mocked(apiClient.post).mockResolvedValue({} as never);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and record' }));
    expect(await within(dialog).findByText('A note is required.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Note (required)'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and record' }));
    expect(apiClient.post).not.toHaveBeenCalled(); // blank is not a note
    fireEvent.change(within(dialog).getByLabelText('Note (required)'), { target: { value: ' matches the tally ' } });
    const before = listCalls();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and record' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/offline-reviews/r1/approve', { note: 'matches the tally' }));
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reject POSTs to the reject endpoint with the note; cancel sends nothing', async () => {
    mockList({ items: [upload()], pending_count: 1 });
    vi.mocked(apiClient.post).mockResolvedValue({} as never);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiClient.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note (required)'), { target: { value: 'entered by hand' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject upload' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/offline-reviews/r1/reject', { note: 'entered by hand' }));
  });

  it('a decision someone else already made closes the dialog and refreshes', async () => {
    mockList({ items: [upload()], pending_count: 1 });
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError('This upload was already approved', 409, 'OFFLINE_REVIEW_ALREADY_DECIDED'));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note (required)'), { target: { value: 'dup' } });
    const before = listCalls();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject upload' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });
});

describe('late uploads helpers', () => {
  it('builds the API paths', () => {
    expect(buildLateUploadsPath()).toBe(LIST);
    expect(buildLateUploadsPath('ALL', 5)).toBe('/v1/business/pos/offline-reviews?status=ALL&limit=5');
    expect(lateUploadDecisionPath('a/b', 'approve')).toBe('/v1/business/pos/offline-reviews/a%2Fb/approve');
  });

  it('reads pending_count defensively', () => {
    expect(pendingCountOf({ items: [], pending_count: 3 })).toBe(3);
    expect(pendingCountOf([{ id: 'x' }])).toBe(0);
    expect(pendingCountOf(undefined)).toBe(0);
    expect(pendingCountOf({ pending_count: -1 })).toBe(0);
  });

  it('labels the new flag reasons', () => {
    expect(reasonChipLabel('late_capture_approved')).toBe('Late upload approved');
    expect(reasonExplanation('post_event_grace_sync')).toMatch(/after the event ended/);
  });
});

describe('dashboard badge with late uploads', () => {
  afterEach(() => { vi.clearAllMocks(); mockRole = 'MANAGER'; });

  function mockBadge(flagged: unknown[], pending: number | Error) {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/v1/business/settings') return { pos_enabled: true } as never;
      if (url.startsWith('/v1/business/pos/offline-orders/flagged')) return flagged as never;
      if (url.startsWith('/v1/business/pos/offline-reviews')) {
        if (pending instanceof Error) throw pending;
        return { items: [], pending_count: pending } as never;
      }
      throw new Error(`unexpected GET ${url}`);
    });
  }

  function renderBadge() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}><MemoryRouter><OfflineReviewBadge /></MemoryRouter></QueryClientProvider>,
    );
  }

  it('shows the pending late-upload count, even when nothing else is flagged', async () => {
    mockBadge([], 3);
    renderBadge();
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/offline-sales');
    expect(within(link).getByTestId('late-uploads-count')).toHaveTextContent('3 late uploads await approval');
    expect(link).not.toHaveTextContent('need review');
  });

  it('shows both counts together', async () => {
    mockBadge([{ id: 'a' }], 1);
    renderBadge();
    const link = await screen.findByRole('link');
    expect(link).toHaveTextContent('1 offline sale needs review');
    expect(link).toHaveTextContent('1 late upload awaits approval');
  });

  it('a failing late-upload request never breaks the flagged badge', async () => {
    mockBadge([{ id: 'a' }, { id: 'b' }], new Error('x'));
    renderBadge();
    expect(await screen.findByRole('link')).toHaveTextContent('2 offline sales need review');
    expect(screen.queryByTestId('late-uploads-count')).not.toBeInTheDocument();
  });
});

describe('Offline sales review page', () => {
  afterEach(() => { vi.clearAllMocks(); mockRole = 'MANAGER'; });

  it('shows the late uploads section above the flagged list', async () => {
    const { default: OfflineSalesReviewPage } = await import('@/pages/OfflineSalesReviewPage');
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === LIST) return { items: [upload()], pending_count: 1 } as never;
      if (url.startsWith('/v1/business/pos/offline-orders/flagged')) return [] as never;
      if (url === '/v1/business/staff') return [] as never;
      throw new Error(`unexpected GET ${url}`);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><OfflineSalesReviewPage /></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: /Late uploads awaiting review/ })).toBeInTheDocument();
    expect(await screen.findByTestId('late-upload-row')).toBeInTheDocument();
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });
});
