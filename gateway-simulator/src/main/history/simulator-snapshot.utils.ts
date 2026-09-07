import type { SimulatorSnapshot } from './simulator-history.types';

export function snapshotsEqual(a: SimulatorSnapshot, b: SimulatorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneSnapshot(snapshot: SimulatorSnapshot): SimulatorSnapshot {
  return structuredClone(snapshot);
}
