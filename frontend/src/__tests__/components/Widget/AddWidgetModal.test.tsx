import { render, screen } from '@testing-library/react';
import { AddWidgetModal } from '@/components/Widget/AddWidgetModal';
import { UserRole } from '@/types/auth.types';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: {
      user: { id: 'u1', role: UserRole.TENANT, email: 't@t.com', firstName: 'T', lastName: 'T' },
      isAuthenticated: true,
      isLoading: false,
    },
  }),
}));

describe('AddWidgetModal', () => {
  it('hides admin-only widgets for tenants', () => {
    render(
      <AddWidgetModal
        isOpen
        onClose={() => {}}
        onAddWidget={() => {}}
        existingWidgets={[]}
        maxWidgets={20}
      />
    );
    expect(screen.queryByText(/Facilities Count/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Access History/i)).toBeInTheDocument();
  });
});
