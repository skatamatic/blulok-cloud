/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditFacilityPage from '@/pages/EditFacilityPage';
import { apiService } from '@/services/api.service';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { id: 'admin-1', role: 'admin' } },
  }),
}));

jest.mock('@/hooks/useBackNavigation', () => ({
  useDetailsBackNavigation: () => ({
    goBack: jest.fn(),
    showBack: true,
    backLabel: 'Back',
  }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getFacility: jest.fn(),
    updateFacility: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

function renderPage(id = 'fac-1') {
  return render(
    <MemoryRouter initialEntries={[`/facilities/${id}/edit`]}>
      <Routes>
        <Route path="/facilities/:id/edit" element={<EditFacilityPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditFacilityPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getFacility.mockResolvedValue({
      success: true,
      facility: {
        id: 'fac-1',
        name: 'North Storage',
        status: 'active',
        address: '1 Main St',
        city: 'Austin',
        state: 'TX',
        zip_code: '78701',
        contact_email: 'ops@example.com',
        contact_phone: '555-0100',
      },
    } as any);
  });

  it('loads facility and shows edit form', async () => {
    renderPage();
    await waitFor(() => expect(mockApi.getFacility).toHaveBeenCalledWith('fac-1'));
    expect(await screen.findByDisplayValue('North Storage')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Austin')).toBeInTheDocument();
  });

  it('shows not found when API returns unsuccessful response', async () => {
    mockApi.getFacility.mockResolvedValueOnce({ success: false } as any);
    renderPage();
    expect(await screen.findByText('Facility not found')).toBeInTheDocument();
  });
});
