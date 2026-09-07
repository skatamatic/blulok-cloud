import {
  FacilityDraftStorage,
  DEFAULT_AUTOSAVE_STORAGE_KEY,
} from '../../../../components/bludesign/core/engine/FacilityDraftStorage';
import { FacilityData, GridSize, CameraMode, IsometricAngle } from '../../../../components/bludesign/core/types';
import * as THREE from 'three';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => '',
    get length() {
      return map.size;
    },
  } as Storage;
}

function minimalFacility(): FacilityData {
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
  };
}

describe('FacilityDraftStorage', () => {
  it('saveDraft and loadFacilityData round-trip', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage(DEFAULT_AUTOSAVE_STORAGE_KEY, mem);
    const data = minimalFacility();
    data.name = 'My Facility';
    store.saveDraft(data);
    const loaded = store.loadFacilityData();
    expect(loaded?.name).toBe('My Facility');
  });

  it('round-trips the facility id when provided', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage(DEFAULT_AUTOSAVE_STORAGE_KEY, mem);
    store.saveDraft(minimalFacility(), 'fac-123');
    expect(store.loadFacilityId()).toBe('fac-123');
  });

  it('loadFacilityId returns null when omitted', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage(DEFAULT_AUTOSAVE_STORAGE_KEY, mem);
    store.saveDraft(minimalFacility());
    expect(store.loadFacilityId()).toBeNull();
  });

  it('peekDraftInfo reflects stored draft', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage('k', mem);
    store.saveDraft(minimalFacility());
    const info = store.peekDraftInfo();
    expect(info.exists).toBe(true);
    expect(typeof info.timestamp).toBe('number');
  });

  it('clear removes draft', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage('k', mem);
    store.saveDraft(minimalFacility());
    store.clear();
    expect(store.loadFacilityData()).toBeNull();
    expect(store.peekDraftInfo().exists).toBe(false);
  });

  it('parseEnvelope returns null for garbage', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage('k', mem);
    mem.setItem('k', 'not json');
    expect(store.loadFacilityData()).toBeNull();
  });

  it('parseEnvelope returns null when JSON is not an object', () => {
    const store = new FacilityDraftStorage('k', createMemoryStorage());
    expect(store.parseEnvelope('"string"')).toBeNull();
  });

  it('parseEnvelope returns null when data field is missing', () => {
    const store = new FacilityDraftStorage('k', createMemoryStorage());
    expect(store.parseEnvelope(JSON.stringify({ timestamp: 1 }))).toBeNull();
  });

  it('parseEnvelope returns envelope when data is present', () => {
    const store = new FacilityDraftStorage('k', createMemoryStorage());
    const data = minimalFacility();
    const raw = JSON.stringify({ timestamp: 42, data });
    const env = store.parseEnvelope(raw);
    expect(env?.timestamp).toBe(42);
    expect(env?.data).toEqual(data);
  });

  it('readRaw returns null when key is absent', () => {
    const store = new FacilityDraftStorage('missing-key', createMemoryStorage());
    expect(store.readRaw()).toBeNull();
  });

  it('peekDraftInfo is false when raw exists but envelope is invalid', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage('k', mem);
    mem.setItem('k', '{}');
    expect(store.peekDraftInfo().exists).toBe(false);
  });

  it('loadFacilityData returns null when envelope parses but data is undefined', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage('k', mem);
    mem.setItem('k', JSON.stringify({ timestamp: 1 }));
    expect(store.loadFacilityData()).toBeNull();
  });

  it('saveDraft writes JSON containing timestamp and nested facility data', () => {
    const mem = createMemoryStorage();
    const store = new FacilityDraftStorage('my-key', mem);
    const data = minimalFacility();
    data.name = 'Saved';
    store.saveDraft(data);
    const raw = mem.getItem('my-key');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.data.name).toBe('Saved');
    expect(typeof parsed.timestamp).toBe('number');
  });
});
