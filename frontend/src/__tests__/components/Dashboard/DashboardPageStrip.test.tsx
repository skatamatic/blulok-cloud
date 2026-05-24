/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import {
  DashboardPageStrip,
  DashboardPageStripPanel,
} from '@/components/Dashboard/DashboardPageStrip';

describe('DashboardPageStrip', () => {
  it('renders all page panels and marks the active one', () => {
    render(
      <DashboardPageStrip pageCount={3} activeIndex={1}>
        <DashboardPageStripPanel pageCount={3} pageIndex={0} isActive={false}>
          <div>Page A</div>
        </DashboardPageStripPanel>
        <DashboardPageStripPanel pageCount={3} pageIndex={1} isActive>
          <div>Page B</div>
        </DashboardPageStripPanel>
        <DashboardPageStripPanel pageCount={3} pageIndex={2} isActive={false}>
          <div>Page C</div>
        </DashboardPageStripPanel>
      </DashboardPageStrip>
    );

    expect(screen.getByText('Page A')).toBeInTheDocument();
    expect(screen.getByText('Page B')).toBeInTheDocument();
    expect(screen.getByText('Page C')).toBeInTheDocument();
    expect(screen.getByText('Page B').closest('[data-active="true"]')).toBeInTheDocument();
  });
});
