import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { TopBar } from './TopBar';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { business_name: 'Kestrel Kitchen', role: 'OWNER', staff_name: 'RC Owner' },
    logout: vi.fn(),
  }),
}));

vi.mock('@/lib/brand-provider', () => ({
  useBrand: () => ({
    displayName: 'NOOSH',
    branchName: 'Pavilion',
    logoUrl: null,
    monogram: 'NO',
    isBranded: true,
    wasAdjusted: false,
    setBrand: vi.fn(),
  }),
}));

vi.mock('@/components/RestaurantIdentity', () => ({
  RestaurantMark: () => <div data-testid="restaurant-mark" />,
}));

function renderTopBar() {
  return render(
    <MemoryRouter>
      <TopBar />
    </MemoryRouter>
  );
}

describe('TopBar — restaurant identity', () => {
  it('leads with the restaurant mark and its trading name', () => {
    renderTopBar();
    expect(screen.getByTestId('restaurant-mark')).toBeInTheDocument();
    expect(screen.getByText('NOOSH')).toBeInTheDocument();
  });

  it('shows the branch alongside the role', () => {
    renderTopBar();
    expect(screen.getByText(/Pavilion/)).toBeInTheDocument();
    expect(screen.getByText(/owner/i)).toBeInTheDocument();
  });
});

describe('TopBar — dark mode is deferred (BUG-0121 / DECISION-0050)', () => {
  /**
   * The theme engine derives brand tokens against a WHITE surface, so in dark
   * mode a dark brand (including the unbranded NextGen charcoal default)
   * renders charcoal-on-charcoal. Until the derivation is theme-aware, this
   * dashboard must not offer a mode we know is broken.
   *
   * This test exists so the control cannot quietly reappear: anyone restoring
   * it has to delete this test, which forces the decision to be revisited
   * rather than reversed by accident.
   */
  it('offers no dark-mode toggle', () => {
    renderTopBar();
    expect(screen.queryByRole('button', { name: /dark|light|theme/i })).toBeNull();
  });

  it('renders no theme-switch icon', () => {
    const { container } = renderTopBar();
    // lucide renders its icon name onto the svg class list.
    expect(container.querySelector('.lucide-sun, .lucide-moon')).toBeNull();
  });
});
