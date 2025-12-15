import { render, screen } from '@testing-library/react';
import { ScheduleVisualizer } from '@/components/Schedules/ScheduleVisualizer';
import { ScheduleWithTimeWindows } from '@/types/schedule.types';

describe('ScheduleVisualizer', () => {
  const mockSchedule: ScheduleWithTimeWindows = {
    id: 'test-schedule-id',
    facility_id: 'test-facility-id',
    name: 'Test Schedule',
    schedule_type: 'custom',
    is_active: true,
    created_by: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    time_windows: [
      { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
      { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00' },
    ],
  };

  it('should render schedule visualizer', () => {
    render(<ScheduleVisualizer schedule={mockSchedule} />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
  });

  it('should display time windows', () => {
    render(<ScheduleVisualizer schedule={mockSchedule} />);
    // Check that time windows are rendered
    expect(screen.getByText(/9:00 AM/i)).toBeInTheDocument();
  });

  it('should show "No access" for days without time windows', () => {
    const scheduleWithNoWindows: ScheduleWithTimeWindows = {
      ...mockSchedule,
      time_windows: [],
    };
    render(<ScheduleVisualizer schedule={scheduleWithNoWindows} />);
    expect(screen.getAllByText('No access').length).toBeGreaterThan(0);
  });
});

