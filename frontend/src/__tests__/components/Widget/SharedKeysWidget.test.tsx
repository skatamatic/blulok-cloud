/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SharedKeysWidget } from '@/components/Widget/SharedKeysWidget';

const mockGetKeySharing = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getKeySharing: (...args: unknown[]) => mockGetKeySharing(...args),
  },
}));

// Stable authState.user — see AccessHistoryWidget.test.tsx (useEffect deps).
jest.mock('@/contexts/AuthContext', () => {
  const authState = { user: { id: 'user-1' } };
  return {
    useAuth: () => ({ authState }),
  };
});

jest.mock('@/components/Widget/Widget', () => ({
  Widget: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

describe('SharedKeysWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetKeySharing.mockReset();
    mockGetKeySharing.mockResolvedValue({ sharings: [] });
  });

  it('shows loading then empty state', async () => {
    mockGetKeySharing.mockResolvedValue({ sharings: [] });

    render(<SharedKeysWidget currentSize="medium" onSizeChange={jest.fn()} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no shared keys found/i)).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    mockGetKeySharing.mockRejectedValue(new Error('fail'));

    render(<SharedKeysWidget currentSize="medium" onSizeChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load shared keys/i)).toBeInTheDocument();
    });
  });

  it('renders a sharing card in full view', async () => {
    const expires = new Date(Date.now() + 86400000 * 5).toISOString();
    mockGetKeySharing.mockResolvedValue({
      sharings: [
        {
          id: 'ks1',
          unit_id: 'u1',
          primary_tenant_id: 't1',
          shared_with_user_id: 't2',
          access_level: 'full',
          granted_by: 'admin',
          is_active: true,
          created_at: '',
          updated_at: '',
          expires_at: expires,
          unit: { unit_number: 'B-2' },
          primary_tenant: { first_name: 'Alex', last_name: 'Kim' },
          shared_with_user: { first_name: 'Sam', last_name: 'Lee' },
        },
      ],
    });

    render(<SharedKeysWidget currentSize="medium" onSizeChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('B-2')).toBeInTheDocument();
    });
    expect(screen.getByText(/primary:/i)).toBeInTheDocument();
    expect(screen.getByText(/Alex Kim/)).toBeInTheDocument();
    expect(screen.getByText(/Sam Lee/)).toBeInTheDocument();
  });
});
