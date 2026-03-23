/**
 * @jest-environment jsdom
 */
import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleEditor, ScheduleEditorRef } from '@/components/Schedules/ScheduleEditor';
import type { TimeWindow } from '@/types/schedule.types';

describe('ScheduleEditor', () => {
  it('adds a default window for a day and invokes onChange', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(<ScheduleEditor timeWindows={[]} onChange={onChange} />);

    const addButtons = screen.getAllByRole('button', { name: /^add$/i });
    await user.click(addButtons[1]);

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as TimeWindow[];
    expect(last).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          day_of_week: 1,
          start_time: '09:00:00',
          end_time: '17:00:00',
        }),
      ])
    );
  });

  it('exposes getValue via ref when onChange is omitted', async () => {
    const user = userEvent.setup();
    const ref = createRef<ScheduleEditorRef>();

    render(<ScheduleEditor ref={ref} timeWindows={[]} />);

    expect(ref.current?.getValue()).toEqual([]);

    const addButtons = screen.getAllByRole('button', { name: /^add$/i });
    await user.click(addButtons[3]);

    const value = ref.current?.getValue() ?? [];
    expect(value.some((w) => w.day_of_week === 3)).toBe(true);
  });

  it('reports validation errors for overlapping windows on the same day', () => {
    const overlapping: TimeWindow[] = [
      { day_of_week: 1, start_time: '09:00:00', end_time: '13:00:00' },
      { day_of_week: 1, start_time: '12:00:00', end_time: '14:00:00' },
    ];
    const ref = createRef<ScheduleEditorRef>();

    render(<ScheduleEditor ref={ref} timeWindows={overlapping} />);

    expect(ref.current?.hasValidationErrors()).toBe(true);
    expect(ref.current?.getValidationErrors()['1']).toEqual(
      expect.arrayContaining([expect.stringMatching(/overlaps/i)])
    );
  });

  it('reports validation errors when start is not before end', () => {
    const invalid: TimeWindow[] = [
      { day_of_week: 2, start_time: '14:00:00', end_time: '09:00:00' },
    ];
    const ref = createRef<ScheduleEditorRef>();

    render(<ScheduleEditor ref={ref} timeWindows={invalid} />);

    expect(ref.current?.hasValidationErrors()).toBe(true);
    expect(ref.current?.getValidationErrors()['2']).toEqual(
      expect.arrayContaining([expect.stringMatching(/invalid time range/i)])
    );
  });

  it('sets all days to 24/7 when global Always is clicked', async () => {
    const user = userEvent.setup();
    const ref = createRef<ScheduleEditorRef>();

    render(<ScheduleEditor ref={ref} timeWindows={[]} />);

    await user.click(screen.getByRole('button', { name: /^always$/i }));

    const value = ref.current?.getValue() ?? [];
    expect(value).toHaveLength(7);
    expect(value.every((w) => w.start_time === '00:00:00' && w.end_time === '23:59:59')).toBe(true);
  });
});
