/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CreateScheduleModal } from '@/components/Schedules/CreateScheduleModal';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';

jest.mock('@/services/api.service');
jest.mock('@/contexts/ToastContext');

describe('CreateScheduleModal', () => {
  const addToast = jest.fn();
  const onClose = jest.fn();
  const onCreated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue({ addToast });
    (apiService.createSchedule as jest.Mock).mockResolvedValue({ success: true });
  });

  it('requires a schedule name', async () => {
    render(
      <CreateScheduleModal
        isOpen
        facilityId="fac-1"
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(addToast).toHaveBeenCalledWith({ type: 'error', title: 'Schedule name is required' });
    expect(apiService.createSchedule).not.toHaveBeenCalled();
  });

  it('creates a custom schedule and closes', async () => {
    render(
      <CreateScheduleModal
        isOpen
        facilityId="fac-1"
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Enter schedule name'), {
      target: { value: 'Weekend Access' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(apiService.createSchedule).toHaveBeenCalledWith(
        'fac-1',
        expect.objectContaining({
          name: 'Weekend Access',
          schedule_type: 'custom',
          is_active: true,
        }),
      );
    });
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
