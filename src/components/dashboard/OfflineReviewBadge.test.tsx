import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflineReviewBadge } from './OfflineReviewBadge';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

let mockRole = 'OWNER';
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mockRole } }) }));

function mockApi(flagged: unknown[] | Error, pos = true) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/v1/business/settings') return { pos_enabled: pos } as never;
    if (url.startsWith('/v1/business/pos/offline-orders/flagged')) {
      if (flagged instanceof Error) throw flagged;
      return flagged as never;
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

const flaggedCalled = () =>
  vi.mocked(apiClient.get).mock.calls.some(([u]) => String(u).includes('offline-orders'));

describe('OfflineReviewBadge', () => {
  afterEach(() => { vi.clearAllMocks(); mockRole = 'OWNER'; });

  it('links to the review screen with the count, using one small request', async () => {
    mockApi([{ id: 'a' }, { id: 'b' }]);
    renderBadge();
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/offline-sales');
    expect(link).toHaveTextContent('2 offline sales need review');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/business/pos/offline-orders/flagged?limit=20');
  });

  it('caps at 20+ because the API returns no total', async () => {
    mockApi(Array.from({ length: 20 }, (_, i) => ({ id: String(i) })));
    renderBadge();
    expect(await screen.findByRole('link')).toHaveTextContent('20+');
  });

  it('renders nothing when nothing is flagged', async () => {
    mockApi([]);
    const r = renderBadge();
    await waitFor(() => expect(flaggedCalled()).toBe(true));
    expect(r.container).toBeEmptyDOMElement();
  });

  it('renders nothing when the request fails', async () => {
    mockApi(new Error('x'));
    const r = renderBadge();
    await waitFor(() => expect(flaggedCalled()).toBe(true));
    expect(r.container).toBeEmptyDOMElement();
  });

  it('never queries when POS is off', async () => {
    mockApi([{ id: 'a' }], false);
    const r = renderBadge();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/v1/business/settings'));
    await new Promise((res) => setTimeout(res, 30));
    expect(r.container).toBeEmptyDOMElement();
    expect(flaggedCalled()).toBe(false);
  });

  it('never queries for other roles', async () => {
    mockRole = 'STAFF';
    mockApi([{ id: 'a' }]);
    const r = renderBadge();
    await new Promise((res) => setTimeout(res, 30));
    expect(r.container).toBeEmptyDOMElement();
    expect(flaggedCalled()).toBe(false);
  });
});
