import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppUsageCard } from './WhatsAppUsageCard';
import { apiClient } from '@/lib/api-client';
import type { WhatsAppOrderUsage } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WhatsAppUsageCard />
    </QueryClientProvider>
  );
}

function usage(overrides: Partial<WhatsAppOrderUsage>): WhatsAppOrderUsage {
  return {
    period_start: '2026-10-01',
    orders_used: 40,
    orders_allowance: 100,
    orders_remaining: 60,
    pct_used: 40,
    tier: 'ok',
    ...overrides,
  };
}

describe('WhatsAppUsageCard', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders nothing when the tenant has no configured allowance (orders_allowance: null) — the majority case today', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(usage({ orders_allowance: null, orders_remaining: null, pct_used: null }) as never);
    const { container } = renderCard();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the query is loading', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the usage fetch fails — a glitch here must never show a broken card', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    const { container } = renderCard();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows usage, a tier pill and a progress bar when a real allowance is configured and the tier is "ok"', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(usage({}) as never);
    renderCard();

    await waitFor(() => expect(screen.getByText(/40 of 100 orders used/i)).toBeInTheDocument());
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByText(/60 remaining/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('shows the "exceeded" tier pill and clamps the bar at 100% when pct_used is over 100', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      usage({ orders_used: 105, orders_allowance: 100, orders_remaining: 0, pct_used: 105, tier: 'exceeded' }) as never
    );
    renderCard();

    await waitFor(() => expect(screen.getByText('Allowance exceeded')).toBeInTheDocument());
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('shows the warning_80/warning_90 tiers distinctly from ok and exceeded', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(usage({ tier: 'warning_80', pct_used: 82 }) as never);
    renderCard();
    await waitFor(() => expect(screen.getByText('80% used')).toBeInTheDocument());
  });
});
