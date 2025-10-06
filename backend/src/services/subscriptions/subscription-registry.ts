import { WebSocket } from 'ws';
import { SubscriptionManager, WebSocketMessage, SubscriptionClient } from './base-subscription-manager';
import { GeneralStatsSubscriptionManager } from './general-stats-subscription-manager';
import { DashboardLayoutSubscriptionManager } from './dashboard-layout-subscription-manager';
import { LogsSubscriptionManager } from './logs-subscription-manager';
import { UnitsSubscriptionManager } from './units-subscription-manager';
import { BatterySubscriptionManager } from './battery-subscription-manager';
import { FMSSyncSubscriptionManager } from './fms-sync-subscription-manager';

export class SubscriptionRegistry {
  private managers: Map<string, SubscriptionManager> = new Map();
  private logger = require('@/utils/logger').logger;

  constructor() {
    // Register all subscription managers
    this.registerManager(new GeneralStatsSubscriptionManager());
    this.registerManager(new DashboardLayoutSubscriptionManager());
    this.registerManager(new LogsSubscriptionManager());
    this.registerManager(new UnitsSubscriptionManager());
    this.registerManager(new BatterySubscriptionManager());
    this.registerManager(new FMSSyncSubscriptionManager());
  }

  private registerManager(manager: SubscriptionManager): void {
    this.managers.set(manager.getSubscriptionType(), manager);
    this.logger.info(`📡 Registered subscription manager: ${manager.getSubscriptionType()}`);
  }

  public getManager(subscriptionType: string): SubscriptionManager | undefined {
    return this.managers.get(subscriptionType);
  }

  public async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<void> {
    const subscriptionType = message.subscriptionType;
    if (!subscriptionType) {
      this.sendError(ws, 'Subscription type required');
      return;
    }

    const manager = this.getManager(subscriptionType);
    if (!manager) {
      this.sendError(ws, `Unknown subscription type: ${subscriptionType}`);
      return;
    }

    await manager.handleSubscription(ws, message, client);
  }

  public handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void {
    const subscriptionType = message.subscriptionType;
    if (!subscriptionType) {
      this.sendError(ws, 'Subscription type required');
      return;
    }

    const manager = this.getManager(subscriptionType);
    if (!manager) {
      this.sendError(ws, `Unknown subscription type: ${subscriptionType}`);
      return;
    }

    manager.handleUnsubscription(ws, message, client);
  }

  public cleanup(ws: WebSocket, client: SubscriptionClient): void {
    // Clean up all subscription types for this client
    this.managers.forEach(manager => {
      manager.cleanup(ws, client);
    });
  }

  public getDashboardLayoutManager(): DashboardLayoutSubscriptionManager | undefined {
    return this.getManager('dashboard_layout') as DashboardLayoutSubscriptionManager;
  }

  public getGeneralStatsManager(): GeneralStatsSubscriptionManager | undefined {
    return this.getManager('general_stats') as GeneralStatsSubscriptionManager;
  }

  private sendError(ws: WebSocket, error: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error,
        timestamp: new Date().toISOString()
      }));
    }
  }

  public getLogsManager(): LogsSubscriptionManager {
    return this.managers.get('logs') as LogsSubscriptionManager;
  }

  public getUnitsManager(): UnitsSubscriptionManager | undefined {
    return this.getManager('units') as UnitsSubscriptionManager;
  }

  public getBatteryManager(): BatterySubscriptionManager | undefined {
    return this.getManager('battery_status') as BatterySubscriptionManager;
  }

  public getFMSSyncManager(): FMSSyncSubscriptionManager | undefined {
    return this.getManager('fms_sync_status') as FMSSyncSubscriptionManager;
  }
}
