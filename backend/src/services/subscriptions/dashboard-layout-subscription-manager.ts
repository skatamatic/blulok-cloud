import { WebSocket } from 'ws';

import { UserRole } from '@/types/auth.types';

import {

  BaseSubscriptionManager,

  WebSocketMessage,

  SubscriptionClient,

} from './base-subscription-manager';

import { parseActiveFacilityContext } from '@/utils/dashboard-assignment.utils';



interface DashboardLayoutFilters {

  activeFacilityId?: string;

}



/**

 * Dashboard Layout Subscription Manager

 *

 * Manages real-time subscriptions to user dashboard configurations and widget layouts.

 * Provides personalized dashboard state synchronization across multiple client sessions.

 */

export class DashboardLayoutSubscriptionManager extends BaseSubscriptionManager {

  private userWatchers: Map<string, Set<WebSocket>> = new Map();

  private subscriptionFilters = new Map<string, DashboardLayoutFilters>();

  private wsSubscriptionIds = new Map<WebSocket, string>();



  getSubscriptionType(): string {

    return 'dashboard_layout';

  }



  canSubscribe(_userRole: UserRole): boolean {

    return true;

  }



  async handleSubscription(

    ws: WebSocket,

    message: WebSocketMessage,

    client: SubscriptionClient

  ): Promise<boolean> {

    const subscriptionId =

      message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;



    if (!this.canSubscribe(client.userRole)) {

      this.sendError(

        ws,

        `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`

      );

      return false;

    }



    const filters = (message.data ?? {}) as DashboardLayoutFilters;

    const activeFacilityId =

      filters.activeFacilityId ??

      (filters as { active_facility_id?: string }).active_facility_id;

    this.subscriptionFilters.set(subscriptionId, { activeFacilityId });

    this.wsSubscriptionIds.set(ws, subscriptionId);

    this.clientContext.set(subscriptionId, client);



    this.addWatcher(subscriptionId, ws, client);

    await this.sendInitialData(ws, subscriptionId, client);



    this.logger.info(

      `📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}`

    );

    return true;

  }



  handleUnsubscription(

    ws: WebSocket,

    message: WebSocketMessage,

    client: SubscriptionClient

  ): void {

    const subscriptionId = message.subscriptionId;

    if (!subscriptionId) {

      this.sendError(ws, 'Subscription ID required');

      return;

    }



    this.subscriptionFilters.delete(subscriptionId);

    this.wsSubscriptionIds.delete(ws);

    this.removeWatcher(subscriptionId, ws, client);

    this.clientContext.delete(subscriptionId);

    this.logger.info(

      `📡 ${this.getSubscriptionType()} unsubscription: ${subscriptionId} for user ${client.userId}`

    );

  }



  cleanup(ws: WebSocket, client: SubscriptionClient): void {

    const subscriptionId = this.wsSubscriptionIds.get(ws);

    if (subscriptionId) {

      this.subscriptionFilters.delete(subscriptionId);

      this.clientContext.delete(subscriptionId);

    }

    this.wsSubscriptionIds.delete(ws);

    super.cleanup(ws, client);

  }



  protected async sendInitialData(

    ws: WebSocket,

    subscriptionId: string,

    client: SubscriptionClient

  ): Promise<void> {

    try {

      const response = await this.buildResponseForSubscription(subscriptionId, client);

      this.sendMessage(ws, {

        type: 'dashboard_layout_update',

        subscriptionId,

        data: response,

        timestamp: new Date().toISOString(),

      });

    } catch (error) {

      this.logger.error('Error loading initial dashboard layout:', error);

      this.sendMessage(ws, {

        type: 'dashboard_layout_update',

        subscriptionId,

        data: {

          pages: [],

          layouts: [],

          layoutSource: 'default',

          canEditLayout: false,

          allowMultiplePages: false,

          isDefault: true,

        },

        timestamp: new Date().toISOString(),

      });

    }

  }



  private async buildResponseForSubscription(

    subscriptionId: string,

    client: SubscriptionClient

  ): Promise<Record<string, unknown>> {

    const { buildDashboardApiResponse } = await import(

      '@/services/dashboard-layout.service'

    );

    const filters = this.subscriptionFilters.get(subscriptionId);

    const facilityContext = parseActiveFacilityContext(

      filters?.activeFacilityId,

      client.facilityIds ?? []

    );

    return (await buildDashboardApiResponse(

      client.userId,

      client.userRole,

      facilityContext

    )) as Record<string, unknown>;

  }



  protected override addWatcher(

    subscriptionId: string,

    ws: WebSocket,

    client: SubscriptionClient

  ): void {

    if (!this.userWatchers.has(client.userId)) {

      this.userWatchers.set(client.userId, new Set());

    }

    this.userWatchers.get(client.userId)!.add(ws);

    super.addWatcher(subscriptionId, ws, client);

  }



  protected override removeWatcher(

    subscriptionId: string,

    ws: WebSocket,

    client: SubscriptionClient

  ): void {

    const userWatchers = this.userWatchers.get(client.userId);

    if (userWatchers) {

      userWatchers.delete(ws);

      if (userWatchers.size === 0) {

        this.userWatchers.delete(client.userId);

      }

    }

    super.removeWatcher(subscriptionId, ws, client);

  }



  /** Fan-out facility-aware layout to every open session for a user. */

  public async broadcastResolvedLayoutToUser(userId: string): Promise<void> {

    const watchers = this.userWatchers.get(userId);

    if (!watchers || watchers.size === 0) return;



    let sentCount = 0;

    for (const ws of watchers) {

      if (ws.readyState !== WebSocket.OPEN) continue;



      const subscriptionId = this.wsSubscriptionIds.get(ws);

      const client = subscriptionId

        ? this.clientContext.get(subscriptionId)

        : undefined;

      if (!subscriptionId || !client) continue;



      try {

        const response = await this.buildResponseForSubscription(subscriptionId, client);

        this.sendMessage(ws, {

          type: 'dashboard_layout_update',

          data: response,

          timestamp: new Date().toISOString(),

        });

        sentCount++;

      } catch (err) {

        this.logger.error(

          `Failed to broadcast dashboard layout to user ${userId}:`,

          err

        );

      }

    }



    this.logger.info(

      `Dashboard layout update broadcasted to ${sentCount}/${watchers.size} watchers for user ${userId}`

    );

  }



  /** @deprecated use broadcastResolvedLayoutToUser */

  public broadcastLayoutUpdate(

    userId: string,

    _layouts: unknown,

    _widgetInstances: unknown[],

    _pages?: unknown[],

    _apiResponse?: Record<string, unknown>

  ): void {

    void this.broadcastResolvedLayoutToUser(userId);

  }

}


