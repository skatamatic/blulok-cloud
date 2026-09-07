/**
 * Typed event bus for BluDesignEngine — subscriptions and notifications only.
 * Keeps listener wiring out of the main engine class.
 */

import type { EngineEvent, EngineEventHandler, EngineEventType } from '../types';

export class BluDesignEventBus {
  private readonly handlers = new Map<EngineEventType, Set<EngineEventHandler>>();

  on<T = unknown>(eventType: EngineEventType, handler: EngineEventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EngineEventHandler);

    return () => {
      this.handlers.get(eventType)?.delete(handler as EngineEventHandler);
    };
  }

  off<T = unknown>(eventType: EngineEventType, handler: EngineEventHandler<T>): void {
    this.handlers.get(eventType)?.delete(handler as EngineEventHandler);
  }

  emit<T = unknown>(eventType: EngineEventType, data: T): void {
    const event: EngineEvent<T> = {
      type: eventType,
      data,
      timestamp: Date.now(),
    };

    this.handlers.get(eventType)?.forEach((handler) => {
      try {
        handler(event as EngineEvent);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
      }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}
