import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrandSync } from './BrandSync';
import { apiClient } from '@/lib/api-client';

// Regression for BUG-0193: BrandSync is mounted above the router, so it is alive
// on /login. It must not request /business/settings until a session exists --
// the tokenless request got a 401 cached under the shared ['settings'] key.

let authed = false;
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ isAuthenticated: authed }) }));
vi.mock('@/lib/brand-provider', () => ({ useBrand: () => ({ setBrand: vi.fn() }) }));
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function tree(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <BrandSync />
    </QueryClientProvider>
  );
}

describe('BrandSync (BUG-0193)', () => {
  afterEach(() => { vi.clearAllMocks(); authed = false; });

  it('does not call GET /business/settings while signed out', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(tree(qc));
    await new Promise((r) => setTimeout(r, 30));
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(qc.getQueryState(['settings'])).toBeUndefined();
  });

  it('fetches settings once, only after the session exists, and leaves no failed entry behind', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ id: 'b1', name: 'Demo' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(tree(qc));
    expect(apiClient.get).not.toHaveBeenCalled();

    authed = true; // login completes
    view.rerender(tree(qc));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/v1/business/settings'));
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(qc.getQueryState(['settings'])?.status).toBe('success'));
  });
});
