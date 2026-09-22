import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoyaltyPage from './LoyaltyPage';
import { apiClient, ApiError } from '@/lib/api-client';
import type { LoyaltyProgram, LoyaltyReward, CustomerLoyalty } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const DISABLED_PROGRAM: LoyaltyProgram = {
  is_enabled: false,
  points_per_rand: 1,
  points_per_order: 0,
  points_expiry_days: null,
  min_redemption_points: 0,
  silver_tier_points: 500,
  gold_tier_points: 2000,
  birthday_reward_points: null,
  referral_reward_points: null,
  double_points_promo_active: false,
  double_points_promo_starts_at: null,
  double_points_promo_ends_at: null,
};

const ENABLED_PROGRAM: LoyaltyProgram = { ...DISABLED_PROGRAM, is_enabled: true };

const REWARDS: LoyaltyReward[] = [
  { id: 'r1', name: 'Free coffee', description: 'One regular coffee', points_cost: 100, is_active: true },
];

const CUSTOMER: CustomerLoyalty = {
  customer_id: 'c1',
  display_name: 'Jane Doe',
  phone_number: '27821234567',
  loyalty_points_balance: 250,
  loyalty_tier: 'SILVER',
};

function mockGet(map: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    for (const key of Object.keys(map)) {
      if (path === key || path.startsWith(key + '?')) return Promise.resolve(map[key]);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('LoyaltyPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows a simple enable-it prompt when the program is disabled, and hides rewards/lookup', async () => {
    mockGet({ '/v1/business/loyalty/program': DISABLED_PROGRAM });
    renderWithClient(<LoyaltyPage />);

    await waitFor(() => expect(screen.getByText(/loyalty isn't enabled yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/reward catalogue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/customer lookup/i)).not.toBeInTheDocument();
    // Advanced rate/tier fields are hidden while disabled too.
    expect(screen.queryByText(/points per rand spent/i)).not.toBeInTheDocument();
  });

  it('shows rewards catalogue and customer lookup once the program is enabled', async () => {
    mockGet({
      '/v1/business/loyalty/program': ENABLED_PROGRAM,
      '/v1/business/loyalty/rewards': REWARDS,
    });
    renderWithClient(<LoyaltyPage />);

    await waitFor(() => expect(screen.getByText(/reward catalogue/i)).toBeInTheDocument());
    expect(await screen.findByText('Free coffee')).toBeInTheDocument();
    expect(screen.getByText(/customer lookup/i)).toBeInTheDocument();
  });

  it('reward form requires a name and a points cost before it can be submitted', async () => {
    mockGet({
      '/v1/business/loyalty/program': ENABLED_PROGRAM,
      '/v1/business/loyalty/rewards': [],
    });
    renderWithClient(<LoyaltyPage />);

    fireEvent.click(await screen.findByRole('button', { name: /add reward/i }));
    const nameInput = await screen.findByPlaceholderText(/free coffee/i);
    expect(nameInput).toBeRequired();
    const pointsInput = screen.getByLabelText(/points cost/i);
    expect(pointsInput).toBeRequired();
  });

  it('redemption copy never claims to discount an order — it only describes recording a points redemption', async () => {
    mockGet({
      '/v1/business/loyalty/program': ENABLED_PROGRAM,
      '/v1/business/loyalty/rewards': REWARDS,
    });
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/loyalty/program') return Promise.resolve(ENABLED_PROGRAM);
      if (path === '/v1/business/loyalty/rewards') return Promise.resolve(REWARDS);
      if (path.startsWith('/v1/business/loyalty/customers/lookup')) return Promise.resolve(CUSTOMER);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    renderWithClient(<LoyaltyPage />);

    const phoneInput = await screen.findByPlaceholderText(/27821234567/i);
    fireEvent.change(phoneInput, { target: { value: '27821234567' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('250 pts')).toBeInTheDocument();

    // The redeem section must be explicit that this only records a points
    // redemption, never that it discounts an order (BUG-0004-style false
    // success claim about money).
    expect(screen.getByText(/does not apply a discount to any order/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record redemption/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply discount/i })).not.toBeInTheDocument();
  });

  it('calls POST /redeem with reward_id (not an arbitrary amount) and shows the resulting balance honestly', async () => {
    mockGet({
      '/v1/business/loyalty/program': ENABLED_PROGRAM,
      '/v1/business/loyalty/rewards': REWARDS,
    });
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/loyalty/program') return Promise.resolve(ENABLED_PROGRAM);
      if (path === '/v1/business/loyalty/rewards') return Promise.resolve(REWARDS);
      if (path.startsWith('/v1/business/loyalty/customers/lookup')) return Promise.resolve(CUSTOMER);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    vi.mocked(apiClient.post).mockResolvedValue({ success: true, points_delta: -100, balance_after: 150 });

    renderWithClient(<LoyaltyPage />);

    const phoneInput = await screen.findByPlaceholderText(/27821234567/i);
    fireEvent.change(phoneInput, { target: { value: '27821234567' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    const select = screen.getByDisplayValue(/select a reward/i);
    fireEvent.change(select, { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: /record redemption/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/business/loyalty/redeem', { customer_id: 'c1', reward_id: 'r1' })
    );
    await waitFor(() => expect(screen.getByText('150 pts')).toBeInTheDocument());
  });

  it('shows a retryable error state (not a silent blank result) when the phone lookup fails', async () => {
    mockGet({
      '/v1/business/loyalty/program': ENABLED_PROGRAM,
      '/v1/business/loyalty/rewards': REWARDS,
    });
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/loyalty/program') return Promise.resolve(ENABLED_PROGRAM);
      if (path === '/v1/business/loyalty/rewards') return Promise.resolve(REWARDS);
      if (path.startsWith('/v1/business/loyalty/customers/lookup')) {
        return Promise.reject(new ApiError('Loyalty program not found', 404, 'NOT_FOUND'));
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    renderWithClient(<LoyaltyPage />);

    const phoneInput = await screen.findByPlaceholderText(/27821234567/i);
    fireEvent.change(phoneInput, { target: { value: '0000000000' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));

    await waitFor(() => expect(screen.getByText(/loyalty program not found/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
