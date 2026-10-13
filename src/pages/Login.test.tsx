import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './Login';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

let mockIsAuthenticated = false;
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    login: vi.fn(),
    setNewPassword: vi.fn(),
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage — authenticated redirect happens via effect, not during render', () => {
  afterEach(() => {
    navigateMock.mockClear();
    mockIsAuthenticated = false;
  });

  it('does not call navigate synchronously during the initial render pass, even when already authenticated', () => {
    mockIsAuthenticated = true;
    // react-dom/server's renderToString executes the render phase only --
    // it never runs effects (useEffect never fires during SSR). If
    // navigate() were still called directly from the component body (the
    // old anti-pattern this fix removes), it would show up here even
    // though no effect ever ran. Asserting it does NOT fire proves the
    // side effect has actually moved out of the render phase.
    renderToString(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does call navigate (via the effect) once mounted in a real browser-like environment', () => {
    mockIsAuthenticated = true;
    renderLogin();
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('renders null (no login form) while authenticated', () => {
    mockIsAuthenticated = true;
    renderLogin();
    expect(screen.queryByText('Manager Login')).not.toBeInTheDocument();
  });

  it('renders the login form and does not navigate when not authenticated', () => {
    mockIsAuthenticated = false;
    renderLogin();
    expect(screen.getByText('Manager Login')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
