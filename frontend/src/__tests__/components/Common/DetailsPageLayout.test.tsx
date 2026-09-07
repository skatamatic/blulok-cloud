import { render, screen } from '@testing-library/react';
import {
  DetailsPageHeader,
  ListPageHeader,
  OverviewSectionHeader,
} from '@/components/Common/DetailsPageLayout';

describe('DetailsPageLayout headers', () => {
  it('hides empty actions slot on mobile but reserves space from sm breakpoint', () => {
    render(<DetailsPageHeader title="Facility" />);

    const actionsSlot = screen.getByTestId('details-header-actions');
    expect(actionsSlot).toHaveClass('hidden', 'sm:flex');
    expect(actionsSlot).toBeEmptyDOMElement();
  });

  it('shows actions slot when actions are provided', () => {
    render(
      <DetailsPageHeader
        title="Facility"
        actions={<button type="button">Add device</button>}
      />,
    );

    const actionsSlot = screen.getByTestId('details-header-actions');
    expect(actionsSlot).toHaveClass('flex');
    expect(actionsSlot).not.toHaveClass('hidden');
    expect(screen.getByRole('button', { name: 'Add device' })).toBeInTheDocument();
  });

  it('applies the same empty actions slot behavior to ListPageHeader', () => {
    render(<ListPageHeader title="Devices" />);

    const actionsSlot = screen.getByTestId('details-header-actions');
    expect(actionsSlot).toHaveClass('hidden', 'sm:flex');
  });

  it('stacks overview section action below title on narrow layouts', () => {
    render(
      <OverviewSectionHeader
        title="Access"
        description="Group membership"
        action={<a href="/groups">Manage groups</a>}
      />,
    );

    const header = screen.getByTestId('overview-section-header');
    expect(header).toHaveClass('flex-col', 'sm:flex-row');
    expect(screen.getByRole('link', { name: 'Manage groups' })).toBeInTheDocument();
  });

  it('hides empty overview action slot on mobile', () => {
    render(
      <OverviewSectionHeader
        title="Danger zone"
        description="Irreversible actions"
      />,
    );

    const actionSlot = screen.getByTestId('overview-section-header-action');
    expect(actionSlot).toHaveClass('hidden', 'sm:flex');
    expect(actionSlot).toBeEmptyDOMElement();
  });
});
