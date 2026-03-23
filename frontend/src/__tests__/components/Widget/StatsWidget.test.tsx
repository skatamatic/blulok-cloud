/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatsWidget } from '@/components/Widget/StatsWidget';

jest.mock('@/components/Widget/Widget', () => ({
  Widget: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="widget-shell">
      <span>{title}</span>
      {children}
    </div>
  ),
}));

const Icon = () => <svg data-testid="icon" />;

describe('StatsWidget', () => {
  it('shows loading state', () => {
    render(
      <StatsWidget
        id="s1"
        title="T"
        value={0}
        icon={Icon}
        loading
      />
    );
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(
      <StatsWidget
        id="s1"
        title="T"
        value={0}
        icon={Icon}
        error="boom"
      />
    );
    expect(screen.getByText(/error loading data/i)).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders value for medium layout', () => {
    render(
      <StatsWidget
        id="s1"
        title="Facilities"
        value={42}
        icon={Icon}
        initialSize="medium"
      />
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders change trend for small layout', () => {
    render(
      <StatsWidget
        id="s1"
        title="X"
        value={10}
        icon={Icon}
        initialSize="small"
        change={{ value: -3, trend: 'down' }}
      />
    );
    expect(screen.getByText('3%')).toBeInTheDocument();
  });
});
