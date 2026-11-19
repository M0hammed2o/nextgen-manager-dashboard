import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { StoreCodeCard } from './StoreCodeCard';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { get: vi.fn() } };
});
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><StoreCodeCard /></QueryClientProvider>);
}

describe('StoreCodeCard', () => {
  beforeEach(() => { vi.mocked(apiClient.get).mockReset(); toast.mockReset(); });

  it("reads the code from the caller's own business settings and copies it", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ business_code: 'AB12CD' } as never);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    expect(await screen.findByTestId('store-code')).toHaveTextContent('AB12CD');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/business/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Copy store code' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('AB12CD'));
    expect(toast).toHaveBeenCalledWith({ title: 'Store code copied' });
  });

  it('renders nothing when settings cannot be read', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('403'));
    const { container } = renderCard();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
