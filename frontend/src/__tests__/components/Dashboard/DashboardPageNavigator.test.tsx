/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardPageNavigator } from '@/components/Dashboard/DashboardPageNavigator';

describe('DashboardPageNavigator', () => {
  it('renders nothing when only one page', () => {
    const { container } = render(
      <DashboardPageNavigator
        pageCount={1}
        activeIndex={0}
        pageNames={['Main']}
        onSelectPage={jest.fn()}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows bottom pager with dots and side arrows for multiple pages', () => {
    render(
      <DashboardPageNavigator
        pageCount={3}
        activeIndex={1}
        pageNames={['A', 'B', 'C']}
        onSelectPage={jest.fn()}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByLabelText('Previous dashboard page')).toBeInTheDocument();
    expect(screen.getByLabelText('Next dashboard page')).toBeInTheDocument();
  });

  it('calls onSelectPage when dot clicked', () => {
    const onSelectPage = jest.fn();
    render(
      <DashboardPageNavigator
        pageCount={2}
        activeIndex={0}
        pageNames={['One', 'Two']}
        onSelectPage={onSelectPage}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(onSelectPage).toHaveBeenCalledWith(1);
  });

  it('calls onPrev and onNext when arrow buttons clicked', () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    render(
      <DashboardPageNavigator
        pageCount={3}
        activeIndex={1}
        pageNames={['A', 'B', 'C']}
        onSelectPage={jest.fn()}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    fireEvent.click(screen.getByLabelText('Previous dashboard page'));
    fireEvent.click(screen.getByLabelText('Next dashboard page'));
    expect(onPrev).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });
});
