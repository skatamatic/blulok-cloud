/**
 * Debounced draft persistence (no BluDesignEngine).
 */

import { DraftAutoSaveScheduler } from '../../../../components/bludesign/core/engine/DraftAutoSaveScheduler';
import { FacilityDraftStorage } from '../../../../components/bludesign/core/engine/FacilityDraftStorage';
import { FacilityData, GridSize, CameraMode, IsometricAngle } from '../../../../components/bludesign/core/types';
import * as THREE from 'three';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
    key: () => '',
    get length() {
      return map.size;
    },
  } as Storage;
}

function minimalFacility(overrides: Partial<FacilityData> = {}): FacilityData {
  return {
    name: 't',
    version: '2.0.0',
    camera: {
      mode: CameraMode.FREE,
      isometricAngle: IsometricAngle.SOUTH_WEST,
      position: new THREE.Vector3(0, 0, 0),
      target: new THREE.Vector3(0, 0, 0),
      zoom: 1,
    },
    placedObjects: [],
    buildings: [],
    activeFloor: 0,
    activeSkins: {},
    gridSize: GridSize.TINY,
    showGrid: true,
    ...overrides,
  };
}

describe('DraftAutoSaveScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('saveNow writes export payload to FacilityDraftStorage and notifies', () => {
    const mem = createMemoryStorage();
    const draftStorage = new FacilityDraftStorage('draft-key', mem);
    const data = minimalFacility({ name: 'SavedName' });
    const onSaved = jest.fn();

    const sched = new DraftAutoSaveScheduler(1000, {
      isReadonly: () => false,
      exportData: () => data,
      storage: draftStorage,
      onSaved,
    });

    sched.saveNow();

    expect(draftStorage.loadFacilityData()?.name).toBe('SavedName');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(typeof onSaved.mock.calls[0][0]).toBe('number');
  });

  it('schedule debounces until delay elapses', () => {
    const mem = createMemoryStorage();
    const draftStorage = new FacilityDraftStorage('k', mem);
    const exportData = jest.fn(() => minimalFacility({ name: 'once' }));

    const sched = new DraftAutoSaveScheduler(500, {
      isReadonly: () => false,
      exportData,
      storage: draftStorage,
      onSaved: jest.fn(),
    });

    sched.schedule();
    sched.schedule();
    expect(exportData).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(exportData).toHaveBeenCalledTimes(1);
    expect(draftStorage.loadFacilityData()?.name).toBe('once');
  });

  it('does not schedule or save when readonly', () => {
    const exportData = jest.fn(() => minimalFacility());
    const draftStorage = new FacilityDraftStorage('k', createMemoryStorage());
    const onSaved = jest.fn();

    const sched = new DraftAutoSaveScheduler(100, {
      isReadonly: () => true,
      exportData,
      storage: draftStorage,
      onSaved,
    });

    sched.schedule();
    jest.runAllTimers();
    sched.saveNow();

    expect(exportData).not.toHaveBeenCalled();
    expect(draftStorage.loadFacilityData()).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('dispose clears pending debounced save', () => {
    const exportData = jest.fn(() => minimalFacility());
    const draftStorage = new FacilityDraftStorage('k', createMemoryStorage());

    const sched = new DraftAutoSaveScheduler(1000, {
      isReadonly: () => false,
      exportData,
      storage: draftStorage,
      onSaved: jest.fn(),
    });

    sched.schedule();
    sched.dispose();
    jest.runAllTimers();

    expect(exportData).not.toHaveBeenCalled();
  });

  it('getLastSaveTime updates after saveNow', () => {
    const sched = new DraftAutoSaveScheduler(100, {
      isReadonly: () => false,
      exportData: () => minimalFacility(),
      storage: new FacilityDraftStorage('k', createMemoryStorage()),
      onSaved: jest.fn(),
    });

    expect(sched.getLastSaveTime()).toBe(0);
    sched.saveNow();
    expect(sched.getLastSaveTime()).toBeGreaterThan(0);
  });
});
