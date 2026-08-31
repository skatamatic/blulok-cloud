import { render, screen } from '@testing-library/react';
import { PlaceholderUserBadge } from '@/components/UserManagement/PlaceholderUserBadge';

describe('PlaceholderUserBadge', () => {
  it('renders No login label with explanatory title', () => {
    render(<PlaceholderUserBadge />);
    const badge = screen.getByText('No login');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', expect.stringContaining('Cannot log in'));
  });
});
