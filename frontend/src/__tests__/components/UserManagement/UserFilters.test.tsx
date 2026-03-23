/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserFilters } from '@/components/UserManagement/UserFilters';

describe('UserFilters', () => {
  const base = {
    search: '',
    onSearchChange: jest.fn(),
    roleFilter: '',
    onRoleFilterChange: jest.fn(),
    facilityFilter: '',
    onFacilityFilterChange: jest.fn(),
    facilities: [{ id: 'f1', name: 'Facility One' }],
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders and calls onSearchChange', () => {
    render(<UserFilters {...base} />);
    const input = screen.getByLabelText(/search/i);
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(base.onSearchChange).toHaveBeenCalledWith('ab');
  });

  it('calls role and facility change handlers', () => {
    render(<UserFilters {...base} />);
    fireEvent.change(screen.getByLabelText(/^role$/i), { target: { value: 'tenant' } });
    expect(base.onRoleFilterChange).toHaveBeenCalledWith('tenant');
    fireEvent.change(screen.getByLabelText(/^facility$/i), { target: { value: 'f1' } });
    expect(base.onFacilityFilterChange).toHaveBeenCalledWith('f1');
  });

  it('shows loading state for facilities', () => {
    render(<UserFilters {...base} facilitiesLoading />);
    expect(screen.getByText(/Loading facilities/i)).toBeInTheDocument();
  });
});
