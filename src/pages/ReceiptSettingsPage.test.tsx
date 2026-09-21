import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReceiptSettingsPage from './ReceiptSettingsPage';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), put: vi.fn() } };
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const vatCheckbox = () => screen.getByRole('checkbox', { name: /this business is vat registered/i });

describe('ReceiptSettingsPage — VAT rate defaulting and validation', () => {
  afterEach(() => vi.clearAllMocks());

  it('defaults the VAT rate to 15% when the checkbox is turned on and the stored rate is 0', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      vat_registered: false,
      vat_rate_basis_points: 0,
      vat_inclusive_pricing: true,
    });
    renderWithClient(<ReceiptSettingsPage />);

    await waitFor(() => expect(vatCheckbox()).toBeInTheDocument());
    fireEvent.click(vatCheckbox());

    const rateInput = await screen.findByLabelText(/vat rate/i);
    expect((rateInput as HTMLInputElement).value).toBe('15');
  });

  it('defaults the VAT rate to 15% when the checkbox is turned on and the stored rate is empty/undefined', async () => {
    // Simulate a business record with vat_rate_basis_points entirely absent
    // — the same "leaves the rate at 0%" trap, just via a missing field
    // rather than an explicit 0.
    vi.mocked(apiClient.get).mockResolvedValue({ vat_registered: false });
    renderWithClient(<ReceiptSettingsPage />);

    await waitFor(() => expect(vatCheckbox()).toBeInTheDocument());
    // The form's own default (1500 basis points -> "15") already applies
    // here before any toggle, so turning it on must not clobber a real,
    // already-valid rate down to something else.
    fireEvent.click(vatCheckbox());
    const rateInput = await screen.findByLabelText(/vat rate/i);
    expect((rateInput as HTMLInputElement).value).toBe('15');
  });

  it('does not stomp on an existing non-zero rate when the checkbox is toggled on', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      vat_registered: false,
      vat_rate_basis_points: 1000, // 10%, a legitimately different rate
    });
    renderWithClient(<ReceiptSettingsPage />);

    await waitFor(() => expect(vatCheckbox()).toBeInTheDocument());
    fireEvent.click(vatCheckbox());

    const rateInput = await screen.findByLabelText(/vat rate/i);
    expect((rateInput as HTMLInputElement).value).toBe('10');
  });

  it('shows an inline error and disables Save when VAT-registered with a 0% rate', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      vat_registered: true,
      vat_rate_basis_points: 0,
    });
    renderWithClient(<ReceiptSettingsPage />);

    await waitFor(() => expect(vatCheckbox()).toBeInTheDocument());

    expect(await screen.findByText(/enter a vat rate above 0%/i)).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: /save receipt settings/i });
    expect(saveBtn).toBeDisabled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('re-enables Save once a valid rate is entered, and the saved rate is exact (15 -> 1500 basis points)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ vat_registered: true, vat_rate_basis_points: 0 });
    vi.mocked(apiClient.put).mockResolvedValue({});
    renderWithClient(<ReceiptSettingsPage />);

    await waitFor(() => expect(vatCheckbox()).toBeInTheDocument());
    const rateInput = await screen.findByLabelText(/vat rate/i);
    fireEvent.change(rateInput, { target: { value: '15' } });

    const saveBtn = await screen.findByRole('button', { name: /save receipt settings/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put).toHaveBeenCalledWith(
      '/v1/business/settings',
      expect.objectContaining({ vat_registered: true, vat_rate_basis_points: 1500 })
    );
  });

  it('allows saving with a 0% rate when the business is not VAT registered', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ vat_registered: false, vat_rate_basis_points: 0 });
    vi.mocked(apiClient.put).mockResolvedValue({});
    renderWithClient(<ReceiptSettingsPage />);

    await waitFor(() => expect(vatCheckbox()).toBeInTheDocument());
    const saveBtn = screen.getByRole('button', { name: /save receipt settings/i });
    expect(saveBtn).not.toBeDisabled();
  });
});
