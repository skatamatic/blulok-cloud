import { Response } from 'express';
import { AuthenticatedRequest } from '@/types/auth.types';
import { SchedulesService, UserContext } from '@/services/schedules.service';

export async function handleListFacilityUserScheduleAssignments(
  req: AuthenticatedRequest,
  res: Response,
  userContext: UserContext,
): Promise<void> {
  const facilityId = String(req.params.facilityId);
  const assignments = await SchedulesService.listUserScheduleAssignments(facilityId, userContext);
  res.json({
    success: true,
    assignments,
  });
}
