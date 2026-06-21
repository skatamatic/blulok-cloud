/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';

describe('ExpandableFilters', () => {
  const baseSections = [
    {
      title: 'Status',
      options: [
        { key: '', label: 'All Status', color: 'primary' },
        { key: 'available', label: 'Available', color: 'green' },
      ],
      selected: '',
      onSelect: jest.fn(),
    },
    {
      title: 'Unit Type',
      options: [
        { key: '', label: 'All Types', color: 'primary' },
        { key: 'small', label: 'Small', color: 'gray' },
      ],
      selected: 'small',
      onSelect: jest.fn(),
    },
  ];

  it('renders search and filters toggle', () => {
    render(
      <ExpandableFilters
        searchValue=""
        onSearchChange={jest.fn()}
        searchPlaceholder="Search units..."
        isExpanded={false}
        onToggleExpanded={jest.fn()}
        sections={baseSections}
      />,
    );

    expect(screen.getByPlaceholderText('Search units...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('shows filter sections when expanded', () => {
    render(
      <ExpandableFilters
        searchValue=""
        onSearchChange={jest.fn()}
        isExpanded
        onToggleExpanded={jest.fn()}
        sections={baseSections}
      />,
    );

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Unit Type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Available' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides filter panel when collapsed', () => {
    render(
      <ExpandableFilters
        searchValue=""
        onSearchChange={jest.fn()}
        isExpanded={false}
        onToggleExpanded={jest.fn()}
        sections={baseSections}
      />,
    );

    expect(screen.queryByText('Unit Type')).not.toBeInTheDocument();
  });

  it('shows collapsed active-filter summary', () => {
    render(
      <ExpandableFilters
        searchValue=""
        onSearchChange={jest.fn()}
        isExpanded={false}
        onToggleExpanded={jest.fn()}
        hasActiveFilters
        sections={baseSections}
      />,
    );

    expect(screen.getByText(/Unit Type:/)).toBeInTheDocument();
    expect(screen.getByText('Small')).toBeInTheDocument();
  });

  it('calls onToggleExpanded when filters button is clicked', async () => {
    const onToggleExpanded = jest.fn();
    const user = userEvent.setup();

    render(
      <ExpandableFilters
        searchValue=""
        onSearchChange={jest.fn()}
        isExpanded={false}
        onToggleExpanded={onToggleExpanded}
        sections={baseSections}
      />,
    );

    await user.click(screen.getByRole('button', { name: /filters/i }));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('calls onClearFilters when clear is clicked', async () => {
    const onClearFilters = jest.fn();
    const user = userEvent.setup();

    render(
      <ExpandableFilters
        searchValue="abc"
        onSearchChange={jest.fn()}
        isExpanded={false}
        onToggleExpanded={jest.fn()}
        onClearFilters={onClearFilters}
        hasActiveFilters
        sections={baseSections}
      />,
    );

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
