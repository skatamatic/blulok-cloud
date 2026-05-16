/**
 * Persists facility draft JSON (debounced saves from the editor).
 * Injectable storage enables unit tests without touching real localStorage.
 */

import type { FacilityData } from '../types';

export const DEFAULT_AUTOSAVE_STORAGE_KEY = 'bludesign-autosave-draft';

export interface FacilityDraftEnvelope {
  timestamp: number;
  data: FacilityData;
}

export class FacilityDraftStorage {
  constructor(
    private readonly storageKey: string,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  ) {}

  /**
   * Write current facility snapshot as a draft envelope.
   */
  saveDraft(data: FacilityData): void {
    const draft: FacilityDraftEnvelope = {
      timestamp: Date.now(),
      data,
    };
    this.storage.setItem(this.storageKey, JSON.stringify(draft));
  }

  /**
   * Raw JSON string from storage, or null if missing.
   */
  readRaw(): string | null {
    return this.storage.getItem(this.storageKey);
  }

  /**
   * Parse stored JSON into an envelope, or null if invalid / missing data.
   */
  parseEnvelope(raw: string): FacilityDraftEnvelope | null {
    try {
      const draft = JSON.parse(raw) as Partial<FacilityDraftEnvelope>;
      if (!draft || typeof draft !== 'object' || draft.data === undefined) {
        return null;
      }
      return draft as FacilityDraftEnvelope;
    } catch {
      return null;
    }
  }

  /**
   * Whether a draft with facility data exists.
   */
  peekDraftInfo(): { exists: boolean; timestamp?: number } {
    const raw = this.readRaw();
    if (!raw) {
      return { exists: false };
    }
    const envelope = this.parseEnvelope(raw);
    if (!envelope?.data) {
      return { exists: false };
    }
    return {
      exists: true,
      timestamp: envelope.timestamp,
    };
  }

  /**
   * Facility payload if present, otherwise null.
   */
  loadFacilityData(): FacilityData | null {
    const raw = this.readRaw();
    if (!raw) return null;
    const envelope = this.parseEnvelope(raw);
    return envelope?.data ?? null;
  }

  clear(): void {
    this.storage.removeItem(this.storageKey);
  }
}
