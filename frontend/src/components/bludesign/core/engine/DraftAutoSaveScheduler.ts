/**
 * Debounced persistence of facility drafts to injectable storage.
 * Keeps timer and last-save bookkeeping out of {@link BluDesignEngine}.
 */

import type { FacilityData } from '../types';
import type { FacilityDraftStorage } from './FacilityDraftStorage';

export interface DraftAutoSaveSchedulerDeps {
  isReadonly: () => boolean;
  exportData: () => FacilityData;
  storage: FacilityDraftStorage;
  /** Server facility id the current draft belongs to (for sidecar re-fetch on recovery). */
  getFacilityId?: () => string | null;
  /** Called after a successful immediate save (debounced or explicit). */
  onSaved: (timestamp: number) => void;
}

/**
 * Schedules writes to {@link FacilityDraftStorage} after editor changes.
 */
export class DraftAutoSaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSaveTime = 0;

  constructor(
    private readonly debounceMs: number,
    private readonly deps: DraftAutoSaveSchedulerDeps
  ) {}

  /** Queue a save after {@link debounceMs} of inactivity. No-op when readonly. */
  schedule(): void {
    if (this.deps.isReadonly()) return;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.saveNow();
    }, this.debounceMs);
  }

  /**
   * Persist immediately (used by the debounced callback and for explicit flush).
   */
  saveNow(): void {
    if (this.deps.isReadonly()) return;

    try {
      const data = this.deps.exportData();
      this.deps.storage.saveDraft(data, this.deps.getFacilityId?.() ?? null);
      this.lastSaveTime = Date.now();
      console.log('[AutoSave] Draft saved to local storage');
      this.deps.onSaved(this.lastSaveTime);
    } catch (error) {
      console.error('[AutoSave] Failed to save draft:', error);
    }
  }

  getLastSaveTime(): number {
    return this.lastSaveTime;
  }

  /** Clear pending debounced save (e.g. on engine dispose). */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
