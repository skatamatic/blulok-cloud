import { DemoAction, DemoScript, DemoScriptCallbacks } from './demoActionTypes';

export class DemoScriptRunner {
  private currentScript: DemoScript | null = null;
  private currentStep: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private cancelToken: { cancelled: boolean } = { cancelled: false };
  private callbacks: DemoScriptCallbacks;

  constructor(callbacks: DemoScriptCallbacks) {
    this.callbacks = callbacks;
  }

  public async runScript(script: DemoScript): Promise<void> {
    if (this.isRunning) {
      throw new Error('A script is already running. Stop it first.');
    }

    this.currentScript = script;
    this.currentStep = 0;
    this.isRunning = true;
    this.isPaused = false;
    this.cancelToken = { cancelled: false };

    try {
      await this.executeActions(script.actions);
      if (!this.cancelToken.cancelled) {
        this.callbacks.onScriptComplete?.();
      }
    } catch (error) {
      if (!this.cancelToken.cancelled) {
        this.callbacks.onScriptError?.(error as Error);
      }
    } finally {
      this.isRunning = false;
      this.currentScript = null;
      this.currentStep = 0;
    }
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.cancelToken.cancelled = true;
    this.isRunning = false;
    this.isPaused = false;
    this.currentScript = null;
    this.currentStep = 0;
  }

  public pause(): void {
    if (!this.isRunning) {
      return;
    }
    this.isPaused = true;
  }

  public resume(): void {
    if (!this.isRunning) {
      return;
    }
    this.isPaused = false;
  }

  public getCurrentStep(): number {
    return this.currentStep;
  }

  public getTotalSteps(): number {
    return this.currentScript?.actions.length || 0;
  }

  public isScriptRunning(): boolean {
    return this.isRunning;
  }

  public isScriptPaused(): boolean {
    return this.isPaused;
  }

  private async executeActions(actions: DemoAction[]): Promise<void> {
    for (let i = 0; i < actions.length; i++) {
      if (this.cancelToken.cancelled) {
        break;
      }

      // Wait if paused
      while (this.isPaused && !this.cancelToken.cancelled) {
        await this.delay(100);
      }

      if (this.cancelToken.cancelled) {
        break;
      }

      this.currentStep = i + 1;
      this.callbacks.onStepChanged?.(this.currentStep, actions.length);

      const action = actions[i];
      await this.executeAction(action);

      // Small delay between actions for smooth execution
      if (i < actions.length - 1 && !this.cancelToken.cancelled) {
        await this.delay(50);
      }
    }
  }

  private async executeAction(action: DemoAction): Promise<void> {
    switch (action.type) {
      case 'delay':
        await this.delay(action.duration);
        break;

      case 'addStatusCard':
        this.callbacks.onCardAdded?.(action.card);
        break;

      case 'addDetailCard':
        this.callbacks.onCardAdded?.(action.card);
        break;

      case 'addWorkOrderCard':
        this.callbacks.onCardAdded?.(action.card);
        break;

      case 'addMessageCard':
        this.callbacks.onCardAdded?.(action.card);
        break;

      case 'addTimelineCard':
        this.callbacks.onCardAdded?.(action.card);
        break;

      case 'addChecklistCard':
        this.callbacks.onCardAdded?.(action.card);
        break;

      case 'updateChecklistItem':
        // This will be handled by the page component which has access to current card state
        this.callbacks.onChecklistItemUpdated?.(action.cardId, action.itemId, action.completed, action.timestamp);
        break;

      case 'updateCard':
        this.callbacks.onCardUpdated?.(action.cardId, action.updates);
        break;

      case 'removeCard':
        this.callbacks.onCardRemoved?.(action.cardId);
        break;

      case 'clearCards':
        this.callbacks.onCardsCleared?.();
        break;

      case 'changeMapFilter':
        this.callbacks.onMapFilterChanged?.(action.layer);
        break;

      case 'changeMapContent':
        this.callbacks.onMapContentChanged?.(action.content);
        break;

      case 'updateVoiceStatus':
        this.callbacks.onVoiceStatusUpdated?.(action.status);
        break;

      case 'showToast':
        this.callbacks.onToastShown?.(action.toast);
        break;

      case 'addEphemeralStatus':
        this.callbacks.onEphemeralStatusAdded?.(action.id, action.statusType, action.title, action.message);
        break;

      case 'showTimeline':
        this.callbacks.onTimelineShown?.(action.visible);
        break;

      case 'updateTimeline':
        this.callbacks.onTimelineUpdated?.(action.markers);
        break;

      case 'setTimelineStep':
        this.callbacks.onTimelineStepSet?.(action.step);
        break;

      case 'updateTimelineCard':
        this.callbacks.onCardUpdated?.(action.cardId, { currentStep: action.currentStep } as any);
        break;

      case 'updateReportGenerationProgress':
        this.callbacks.onReportGenerationProgress?.(action.progress);
        break;

      default:
        console.warn('Unknown action type:', (action as any).type);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

