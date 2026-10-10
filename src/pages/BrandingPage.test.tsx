import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BrandingPage from './BrandingPage';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), put: vi.fn() },
  };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const SETTINGS = {
  name: 'Kestrel Kitchen (Pty) Ltd',
  brand_display_name: 'Kestrel Kitchen',
  brand_primary_colour: '#C62828',
  brand_accent_colour: null,
  logo_asset_id: null,
  logo_url: null,
  brand_icon_asset_id: null,
  brand_icon_url: null,
} as unknown as BusinessSettings;

function mockApi() {
  vi.mocked(apiClient.get).mockResolvedValue(SETTINGS as never);
  vi.mocked(apiClient.put).mockResolvedValue({} as never);
}

function renderBranding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BrandingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BrandingPage — UI V2.1 (A7): swatch-first colour picking', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a preset swatch for each colour field, with the current colour marked selected', async () => {
    mockApi();
    renderBranding();

    await waitFor(() => expect(screen.getByText('Primary colour')).toBeInTheDocument());
    const activeSwatch = screen.getByRole('button', { name: /use #c62828 for primary colour/i });
    expect(activeSwatch).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a preset swatch sets the same hex value a typed hex would, going through the same validation', async () => {
    mockApi();
    renderBranding();

    await waitFor(() => expect(screen.getByText('Primary colour')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /use #1565c0 for primary colour/i }));

    const hexInputs = screen.getAllByDisplayValue(/^#/i) as HTMLInputElement[];
    expect(hexInputs.some((el) => el.value === '#1565C0')).toBe(true);
  });

  it('typing an invalid hex still shows the existing validation message (unchanged validation path)', async () => {
    mockApi();
    renderBranding();

    await waitFor(() => expect(screen.getByText('Primary colour')).toBeInTheDocument());
    const hexInputs = screen.getAllByPlaceholderText('#000000');
    fireEvent.change(hexInputs[0], { target: { value: 'not-a-colour' } });

    expect(screen.getByText('Use a 6-digit hex colour, like #C62828.')).toBeInTheDocument();
  });

  it('save sends the hex strings in the same backend format as before (no new colour engine)', async () => {
    mockApi();
    renderBranding();

    await waitFor(() => expect(screen.getByText('Primary colour')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /use #2e7d32 for primary colour/i }));

    const saveBtn = screen.getByRole('button', { name: /save branding/i });
    await waitFor(() => expect(saveBtn).not.toBeDisabled());
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        '/v1/business/settings',
        expect.objectContaining({ brand_primary_colour: '#2E7D32' })
      )
    );
  });
});
