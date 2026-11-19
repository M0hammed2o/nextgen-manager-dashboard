import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EventRegisterPage from './EventRegisterPage';
import { apiClient, ApiError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() } };
});

// Radix Checkbox measures itself with ResizeObserver, which jsdom lacks.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const EVENT = {
  name: 'Durban Summer Souk',
  slug: 'summer-souk',
  venue: 'Moses Mabhida Precinct',
  timezone: 'Africa/Johannesburg',
  status: 'OPEN',
  prep_days: 3,
  days: [
    { day: '2026-12-05', is_billable: true },
    { day: '2026-12-06', is_billable: true },
    { day: '2026-12-07', is_billable: false },
  ],
  food_day_rate_cents: 150000,
  clothing_day_rate_cents: 90000,
  registration_open: true,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/events/summer-souk/register']}>
        <Routes>
          <Route path="/events/:slug/register" element={<EventRegisterPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillForm(opts: { password?: string; confirm?: string; terms?: boolean } = {}) {
  const { password = 'correct-horse-9', confirm = password, terms = true } = opts;
  await screen.findByLabelText('Registration code');
  fireEvent.change(screen.getByLabelText('Registration code'), { target: { value: 'ABC123' } });
  fireEvent.change(screen.getByLabelText('Business / stall name'), { target: { value: 'Tasty Bites' } });
  fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Thandi Nkosi' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'thandi@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
  if (terms) fireEvent.click(screen.getByLabelText(/I accept the NextGen terms/));
}

describe('EventRegisterPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows the event name, venue, dates and a price per category', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    renderPage();
    expect(await screen.findByText('Durban Summer Souk')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/v1/public/events/summer-souk');
    expect(screen.getByText('Moses Mabhida Precinct')).toBeInTheDocument();
    expect(screen.getByText(/2 trading days/)).toBeInTheDocument();
    expect(screen.getByText(/1\s?500,00/)).toBeInTheDocument();
    expect(screen.getByText(/900,00/)).toBeInTheDocument();
  });

  it('on success shows the business code prominently, the login date and a Go to login button', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    vi.mocked(apiClient.post).mockResolvedValue({
      business_code: 'K7Q2XM', next: 'login', access_level: 'NONE', login_opens_on: '2026-12-02',
    } as never);
    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByTestId('business-code')).toHaveTextContent('K7Q2XM');
    expect(screen.getByTestId('login-opens')).toHaveTextContent(/2 Dec 2026/);
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login');

    expect(apiClient.post).toHaveBeenCalledWith('/v1/public/events/summer-souk/register', {
      registration_code: 'ABC123',
      business_name: 'Tasty Bites',
      category: 'FOOD',
      owner_full_name: 'Thandi Nkosi',
      owner_email: 'thandi@example.com',
      password: 'correct-horse-9',
      accept_terms: true,
    });
    // The password is not left anywhere in the DOM.
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('says "now" when login_opens_on is null', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    vi.mocked(apiClient.post).mockResolvedValue({
      business_code: 'K7Q2XM', next: 'login', access_level: 'CONFIGURE', login_opens_on: null,
    } as never);
    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByTestId('login-opens')).toHaveTextContent(/log in now/);
  });

  it('shows the same generic message for a 403 and never says why', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('Registration is not available with these details', 403, 'REGISTRATION_REJECTED'));
    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not register you with these details/i);
    // Form is still there so they can correct it.
    expect(screen.getByLabelText('Registration code')).toBeInTheDocument();
  });

  it('shows the generic message for a 409', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('We could not register with these details', 409, 'REGISTRATION_FAILED'));
    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not complete your registration/i);
  });

  it('shows a friendly wait message for a 429', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('Too Many Requests', 429));
    renderPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('blocks submission when the password confirmation does not match', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    renderPage();
    await fillForm({ password: 'correct-horse-9', confirm: 'correct-horse-8' });
    expect(screen.getByText('The two passwords do not match.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('refuses a password longer than 72 bytes without calling the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    renderPage();
    const long = 'é'.repeat(40); // 40 chars, 80 bytes
    await fillForm({ password: long });
    expect(screen.getByText(/72 bytes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps Register disabled until the terms are accepted', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(EVENT as never);
    renderPage();
    await fillForm({ terms: false });
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });

  it('shows an event-not-found state for a 404', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new ApiError('Event not found', 404, 'EVENT_NOT_FOUND'));
    renderPage();
    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });

  it('shows an error with retry when the event cannot be loaded', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new ApiError('boom', 500));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Retry' }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('shows a closed message and no form when registration is closed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ ...EVENT, registration_open: false } as never);
    renderPage();
    expect(await screen.findByText('Registration is closed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Registration code')).not.toBeInTheDocument();
  });
});
