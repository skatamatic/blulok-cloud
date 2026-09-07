/**

 * Broadcast dashboard layout updates to affected users after assignment/template changes.

 */



import { WebSocketService } from '@/services/websocket.service';

import {

  DashboardAssignmentModel,

  DashboardAssignment,

} from '@/models/saved-dashboard.model';

import { ALL_FACILITIES_ID } from '@/utils/dashboard-assignment.utils';



export class DashboardLayoutBroadcastService {

  static async notifyUsers(userIds: string[]): Promise<void> {

    if (userIds.length === 0) return;



    const unique = [...new Set(userIds)];

    const ws = WebSocketService.getInstance();

    const manager = ws.getSubscriptionRegistry().getDashboardLayoutManager();

    if (!manager) return;



    await Promise.all(unique.map((userId) => manager.broadcastResolvedLayoutToUser(userId)));

  }



  static async notifyForAssignment(assignment: DashboardAssignment): Promise<void> {

    const userIds = await DashboardAssignmentModel.findAffectedUserIds(assignment);

    await this.notifyUsers(userIds);

  }



  static async notifyForSavedDashboard(savedDashboardId: string): Promise<void> {

    const userIds =

      await DashboardAssignmentModel.findUserIdsForSavedDashboard(savedDashboardId);

    await this.notifyUsers(userIds);

  }

}



export { ALL_FACILITIES_ID };


