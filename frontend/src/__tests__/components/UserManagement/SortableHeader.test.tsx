/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortableHeader } from '@/components/UserManagement/SortableHeader';

describe('SortableHeader', () => {
  it('sorts new column as desc', () => {
    const onSort = jest.fn();
    render(
      <table>
        <tbody>
          <tr>
            <SortableHeader
              label="Name"
              sortKey="name"
              currentSortBy="email"
              currentSortOrder="asc"
              onSort={onSort}
            />
          </tr>
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(onSort).toHaveBeenCalledWith('name', 'desc');
  });

  it('toggles order when same column active', () => {
    const onSort = jest.fn();
    render(
      <table>
        <tbody>
          <tr>
            <SortableHeader
              label="Email"
              sortKey="email"
              currentSortBy="email"
              currentSortOrder="desc"
              onSort={onSort}
            />
          </tr>
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByRole('button', { name: /email/i }));
    expect(onSort).toHaveBeenCalledWith('email', 'asc');
  });
});
