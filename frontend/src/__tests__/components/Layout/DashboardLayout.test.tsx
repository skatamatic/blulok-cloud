/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';

jest.mock('@/components/Layout/Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar-mock">Sidebar</aside>,
}));

const mockUseSidebar = jest.fn();

jest.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => mockUseSidebar(),
}));

describe('DashboardLayout', () => {
  beforeEach(() => {
    mockUseSidebar.mockReturnValue({ isCollapsed: false });
  });

  it('renders sidebar and main content', () => {
    render(
      <DashboardLayout>
        <p>Main child</p>
      </DashboardLayout>
    );

    expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
    expect(screen.getByText('Main child')).toBeInTheDocument();
  });

  it('uses narrow sidebar width when collapsed', () => {
    mockUseSidebar.mockReturnValue({ isCollapsed: true });

    const { container } = render(
      <DashboardLayout>
        <span>Content</span>
      </DashboardLayout>
    );

    const sidebarShell = container.querySelector('.w-16');
    expect(sidebarShell).toBeInTheDocument();
  });
});
