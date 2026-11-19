import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { StaffDiscountLimitCard } from './StaffDiscountLimitCard';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, put: vi.fn() } };
});
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
let role = 'OWNER';
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role } }) }));

function renderCard(valueCents = 0) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><StaffDiscountLimitCard valueCents={valueCents} /></QueryClientProvider>);
}

describe('StaffDiscountLimitCard', () => {
  afterEach(() => { vi.clearAllMocks(); role = 'OWNER'; });

  it('lets the owner set the limit, sending only that field', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({} as never);
    renderCard(0);
    const input = screen.getByLabelText(/Staff discount limit/);
    expect(input).toHaveValue('0.00');
    expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/v1/business/settings', { max_staff_discount_cents: 5000 }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Staff discount limit saved' }));
  });

  it('validates the amount before sending', () => {
    renderCard(1000);
    const input = screen.getByLabelText(/Staff discount limit/);
    for (const bad of ['-5', 'abc', '1.234', '100001']) {
      fireEvent.change(input, { target: { value: bad } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled();
    }
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('is read-only for a manager (the limit binds managers too)', () => {
    role = 'MANAGER';
    renderCard(2500);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save limit' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only the owner can change this/)).toBeInTheDocument();
    expect(screen.getByText(/25[.,]00/)).toBeInTheDocument();
  });
});
