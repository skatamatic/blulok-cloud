/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppliedFilterBar } from '@/components/Common/AppliedFilterBar';

describe('AppliedFilterBar', () => {
  it('renders nothing when no filters are applied', () => {
    const { container } = render(<AppliedFilterBar filters={[]} onClearAll={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('removes a single filter and clears all', async () => {
    const user = userEvent.setup();
    const onRemoveUnit = jest.fn();
    const onRemoveUser = jest.fn();
    const onClearAll = jest.fn();

    render(
      <AppliedFilterBar
        filters={[
          { id: 'unit', label: 'Unit: 102', onRemove: onRemoveUnit },
          { id: 'user', label: 'User: Tester One', onRemove: onRemoveUser },
        ]}
        onClearAll={onClearAll}
      />,
    );

    expect(screen.getByRole('group', { name: 'Applied filters' })).toBeInTheDocument();
    expect(screen.getByText('Unit: 102')).toBeInTheDocument();
    expect(screen.getByText('User: Tester One')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Unit: 102' }));
    expect(onRemoveUnit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
