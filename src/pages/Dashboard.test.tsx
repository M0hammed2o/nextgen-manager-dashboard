import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './Dashboard';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function mockApi() {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/v1/business/analytics/summary')) {
      return {
        total_orders: 12,
        completed_orders: 10,
        cancelled_orders: 2,
        revenue_cents: 50000,
        total_messages: 30,
        llm_calls: 99,
        llm_cost_cents: 777,
        unique_customers: 8,
      } as never;
    }
    if (url.startsWith('/v1/business/orders')) {
      return { data: [], total: 0 } as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardPage — UI V2.1 (A1): LLM metrics removed, remaining 6 reflowed', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the 6 remaining metrics and never renders LLM Calls or LLM Cost', async () => {
    mockApi();
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Total Orders')).toBeInTheDocument());
    for (const label of ['Revenue', 'Completed', 'Cancelled', 'Messages', 'Unique Customers']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.queryByText('LLM Calls')).not.toBeInTheDocument();
    expect(screen.queryByText('LLM Cost')).not.toBeInTheDocument();
  });

  it('lays the 6 metrics out in one grid of 2 columns on mobile / 3 on desktop', async () => {
    mockApi();
    const { container } = renderDashboard();

    await waitFor(() => expect(screen.getByText('Total Orders')).toBeInTheDocument());
    const grid = screen.getByText('Total Orders').closest('.grid');
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
    expect(grid?.querySelectorAll(':scope > *').length).toBe(6);
    void container;
  });
});
