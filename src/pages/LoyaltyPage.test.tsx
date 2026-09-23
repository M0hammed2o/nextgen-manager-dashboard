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

// Controllable per-test role, same technique Orders.test.tsx uses for
// OrderReversalPanel's role gating — `authState.role` is mutated per test
// rather than re-mocked, since vi.mock factories are hoisted.
const authState = vi.hoisted(() => ({ role: 'OWNER' }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: null, staff_name: 'Test User', role: authState.role, business_id: 'b1', business_name: 'Test Biz' },
  }),
}));

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
  { id: 'r1', name: 'Free coffee', description: 'One regular coffee', points_cost: 100, is_active: true, value_cents: null },
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

describe('LoyaltyPage — reward value: cents conversion boundary (never a float, never silently dropped)', () => {
  afterEach(() => vi.clearAllMocks());

  async function openAddRewardDialogAndFillRequiredFields() {
    mockGet({ '/v1/business/loyalty/program': ENABLED_PROGRAM, '/v1/business/loyalty/rewards': [] });
    renderWithClient(<LoyaltyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /add reward/i }));
    fireEvent.change(await screen.findByPlaceholderText(/free coffee/i), { target: { value: 'Test reward' } });
    fireEvent.change(screen.getByLabelText(/points cost/i), { target: { value: '100' } });
  }

  it.each([
    ['50', 5000],
    ['50.5', 5050],
    ['50.55', 5055],
    ['0', 0],
  ])('parses a "%s" rand input into exactly %i integer cents', async (input, expectedCents) => {
    await openAddRewardDialogAndFillRequiredFields();
    fireEvent.change(screen.getByLabelText(/reward value/i), { target: { value: input } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0] as [string, { value_cents: number | null }];
    expect(path).toBe('/v1/business/loyalty/rewards');
    expect(body.value_cents).toBe(expectedCents);
    expect(Number.isInteger(body.value_cents)).toBe(true);
  });

  it('an empty value field sends value_cents: null — a manual-handover-only reward, never a silently-dropped or defaulted-to-0 value', async () => {
    await openAddRewardDialogAndFillRequiredFields();
    // Value field left blank.
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.post).mock.calls[0] as [string, { value_cents: number | null }];
    expect(body.value_cents).toBeNull();
  });

  it('rejects a value with more than 2 decimal places client-side and never calls the API', async () => {
    await openAddRewardDialogAndFillRequiredFields();
    fireEvent.change(screen.getByLabelText(/reward value/i), { target: { value: '50.555' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    // Both the live "not a valid rand amount yet" preview AND the on-submit
    // "enter a valid reward value" message are shown at once here — assert
    // on the submit-time message specifically to avoid an ambiguous
    // multi-match query.
    expect(await screen.findByText(/enter a valid reward value/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('rejects a negative value client-side and never calls the API', async () => {
    await openAddRewardDialogAndFillRequiredFields();
    fireEvent.change(screen.getByLabelText(/reward value/i), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText(/enter a valid reward value/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('rejects zero or negative points cost client-side and never calls the API', async () => {
    mockGet({ '/v1/business/loyalty/program': ENABLED_PROGRAM, '/v1/business/loyalty/rewards': [] });
    renderWithClient(<LoyaltyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /add reward/i }));
    fireEvent.change(await screen.findByPlaceholderText(/free coffee/i), { target: { value: 'Test reward' } });
    fireEvent.change(screen.getByLabelText(/points cost/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText(/points cost must be a whole number/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe('LoyaltyPage — redeemable-at-POS vs manual-handover reward distinction', () => {
  afterEach(() => vi.clearAllMocks());

  it('a reward with a non-null value_cents (including exactly 0) is shown as POS redeemable; only a null value is manual-handover-only', async () => {
    const rewards: LoyaltyReward[] = [
      { id: 'r1', name: 'Free coffee', description: null, points_cost: 100, is_active: true, value_cents: 5000 },
      { id: 'r2', name: 'Kitchen tour', description: null, points_cost: 500, is_active: true, value_cents: null },
      { id: 'r3', name: 'Zero-value voucher', description: null, points_cost: 10, is_active: true, value_cents: 0 },
    ];
    mockGet({ '/v1/business/loyalty/program': ENABLED_PROGRAM, '/v1/business/loyalty/rewards': rewards });
    renderWithClient(<LoyaltyPage />);

    await screen.findByText('Free coffee');
    // r1 and r3 (value_cents 5000 and 0) are both redeemable; only r2 (null) is manual-only.
    expect(screen.getAllByText(/pos redeemable/i)).toHaveLength(2);
    expect(screen.getAllByText(/manual handover only/i)).toHaveLength(1);
  });
});

describe('LoyaltyPage — manual points adjustment: role gating', () => {
  afterEach(() => {
    vi.clearAllMocks();
    authState.role = 'OWNER';
  });

  async function lookupCustomer() {
    renderWithClient(<LoyaltyPage />);
    const phoneInput = await screen.findByPlaceholderText(/27821234567/i);
    fireEvent.change(phoneInput, { target: { value: '27821234567' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
  }

  function mockLookup() {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/loyalty/program') return Promise.resolve(ENABLED_PROGRAM);
      if (path === '/v1/business/loyalty/rewards') return Promise.resolve(REWARDS);
      if (path.startsWith('/v1/business/loyalty/customers/lookup')) return Promise.resolve(CUSTOMER);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
  }

  it('STAFF never sees the manual points adjustment control, even after a successful customer lookup', async () => {
    authState.role = 'STAFF';
    mockLookup();
    await lookupCustomer();
    expect(screen.queryByRole('button', { name: /adjust points manually/i })).not.toBeInTheDocument();
  });

  it('OWNER sees the manual points adjustment control', async () => {
    authState.role = 'OWNER';
    mockLookup();
    await lookupCustomer();
    expect(screen.getByRole('button', { name: /adjust points manually/i })).toBeInTheDocument();
  });

  it('MANAGER sees the manual points adjustment control', async () => {
    authState.role = 'MANAGER';
    mockLookup();
    await lookupCustomer();
    expect(screen.getByRole('button', { name: /adjust points manually/i })).toBeInTheDocument();
  });
});

describe('LoyaltyPage — manual points adjustment: behaviour', () => {
  afterEach(() => {
    vi.clearAllMocks();
    authState.role = 'OWNER';
  });

  function mockLookup() {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/loyalty/program') return Promise.resolve(ENABLED_PROGRAM);
      if (path === '/v1/business/loyalty/rewards') return Promise.resolve(REWARDS);
      if (path.startsWith('/v1/business/loyalty/customers/lookup')) return Promise.resolve(CUSTOMER);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
  }

  async function lookupAndOpenAdjustDialog() {
    renderWithClient(<LoyaltyPage />);
    const phoneInput = await screen.findByPlaceholderText(/27821234567/i);
    fireEvent.change(phoneInput, { target: { value: '27821234567' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /adjust points manually/i }));
    await screen.findByRole('button', { name: /save adjustment/i });
  }

  it('defaults to "Add" and sends a positive points_delta, showing balance_after from the response (not local arithmetic)', async () => {
    mockLookup();
    vi.mocked(apiClient.post).mockResolvedValue({ customer_id: 'c1', points_delta: 50, balance_after: 999, reason: 'Goodwill' });

    await lookupAndOpenAdjustDialog();
    fireEvent.change(screen.getByLabelText(/points to add/i), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Goodwill credit' } });
    fireEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/v1/business/loyalty/customers/c1/adjust-points',
        expect.objectContaining({ points_delta: 50, reason: 'Goodwill credit' })
      )
    );
    // The balance shown must come from the response's balance_after, never 250 + 50 computed locally.
    await waitFor(() => expect(screen.getByText('999 pts')).toBeInTheDocument());
  });

  it('switching to "Remove points" sends a negative points_delta', async () => {
    mockLookup();
    vi.mocked(apiClient.post).mockResolvedValue({ customer_id: 'c1', points_delta: -30, balance_after: 220, reason: 'Correction' });

    await lookupAndOpenAdjustDialog();
    fireEvent.click(screen.getByRole('button', { name: /^remove points$/i }));
    fireEvent.change(screen.getByLabelText(/points to remove/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Refund correction' } });
    fireEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/v1/business/loyalty/customers/c1/adjust-points',
        expect.objectContaining({ points_delta: -30, reason: 'Refund correction' })
      )
    );
    await waitFor(() => expect(screen.getByText('220 pts')).toBeInTheDocument());
  });

  it('rejects a zero amount client-side and never calls the API', async () => {
    mockLookup();
    await lookupAndOpenAdjustDialog();
    fireEvent.change(screen.getByLabelText(/points to add/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Some reason' } });
    fireEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    expect(await screen.findByText(/enter a whole number of points greater than 0/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('rejects a missing/too-short reason client-side and never calls the API', async () => {
    mockLookup();
    await lookupAndOpenAdjustDialog();
    fireEvent.change(screen.getByLabelText(/points to add/i), { target: { value: '10' } });
    // Reason left blank.
    fireEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    expect(await screen.findByText(/give a reason/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('shows a retryable, non-silent error when the backend rejects the adjustment (e.g. insufficient balance)', async () => {
    mockLookup();
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError('Adjustment would take the balance negative', 422, 'INSUFFICIENT_POINTS_FOR_ADJUSTMENT')
    );

    await lookupAndOpenAdjustDialog();
    fireEvent.change(screen.getByLabelText(/points to add/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Some reason' } });
    fireEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    expect(await screen.findByText(/adjustment would take the balance negative/i)).toBeInTheDocument();
    // The balance shown must stay the pre-adjustment value — nothing was applied.
    expect(screen.getByText('250 pts')).toBeInTheDocument();
  });
});
