import type { Knex } from 'knex';
import type { ScheduleTimeWindow } from '@/models/schedule.model';
import { UserFacilityScheduleModel } from '@/models/user-facility-schedule.model';

/** Inclusive day index range on linear 0–6 (Sun–Sat). */
export type RoutePassDayRange = [number, number];

/**
 * One time band: [dayRanges, start, end]
 * - dayRanges: disjoint inclusive ranges, e.g. Mon–Fri → [[1,5]]; Sat+Sun → [[6,6],[0,0]]
 * - start/end: HH:MM or HH:MM:SS when seconds are non-zero
 */
export type RoutePassScheduleBand = [RoutePassDayRange[], string, string];

/** Per-facility compact schedule in the route pass JWT. */
export type RoutePassFacilitySchedule = {
  f: string;
  w: RoutePassScheduleBand[];
};

export type ParsedRoutePassAudiences = {
  lockSerials: string[];
  sharedKeys: { primaryTenantId: string; lockSerial: string }[];
  accessControlDeviceIds: string[];
};

export function parseRoutePassAudiences(audiences: string[]): ParsedRoutePassAudiences {
  const lockSerialSet = new Set<string>();
  const sharedKeys: { primaryTenantId: string; lockSerial: string }[] = [];
  const acSet = new Set<string>();

  for (const raw of audiences) {
    const aud = String(raw || '').trim();
    if (!aud) continue;
    if (aud.startsWith('lock:')) {
      const serial = aud.slice('lock:'.length).trim();
      if (serial) lockSerialSet.add(serial);
      continue;
    }
    if (aud.startsWith('shared_key:')) {
      const rest = aud.slice('shared_key:'.length);
      const colon = rest.indexOf(':');
      if (colon <= 0 || colon >= rest.length - 1) continue;
      const primaryTenantId = rest.slice(0, colon).trim();
      const lockSerial = rest.slice(colon + 1).trim();
      if (primaryTenantId && lockSerial) {
        lockSerialSet.add(lockSerial);
        sharedKeys.push({ primaryTenantId, lockSerial });
      }
      continue;
    }
    if (aud.startsWith('access_control:')) {
      const id = aud.slice('access_control:'.length).trim();
      if (id) acSet.add(id);
    }
  }

  return {
    lockSerials: Array.from(lockSerialSet),
    sharedKeys,
    accessControlDeviceIds: Array.from(acSet),
  };
}

/**
 * Normalizes DB time strings for the route pass: HH:MM:SS with :00 seconds → HH:MM; otherwise keep full string.
 */
export function normalizeTimeForRoutePass(time: string): string {
  const s = String(time || '').trim();
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (m && m[3] === '00') {
    return `${m[1]}:${m[2]}`;
  }
  return s;
}

type DaySlot = { day: number; start: string; end: string };

function validDaySlot(day: number, start: string, end: string): boolean {
  return (
    Number.isInteger(day)
    && day >= 0
    && day <= 6
    && Boolean(start)
    && Boolean(end)
  );
}

/** From DB-like rows, produce sorted unique day slots with normalized times. */
export function expandScheduleWindowsToDaySlots(
  windows: Pick<ScheduleTimeWindow, 'day_of_week' | 'start_time' | 'end_time'>[],
): DaySlot[] {
  const slots: DaySlot[] = [];
  for (const w of windows || []) {
    const day = Number(w.day_of_week);
    const start = normalizeTimeForRoutePass(String(w.start_time));
    const end = normalizeTimeForRoutePass(String(w.end_time));
    if (!validDaySlot(day, start, end)) continue;
    slots.push({ day, start, end });
  }
  slots.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.end.localeCompare(b.end);
  });
  const out: DaySlot[] = [];
  const seen = new Set<string>();
  for (const sl of slots) {
    const key = `${sl.day}|${sl.start}|${sl.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sl);
  }
  return out;
}

/** Merge sorted unique integers into inclusive linear ranges [lo,hi]. */
export function mergeConsecutiveDaysToRanges(daysSorted: number[]): RoutePassDayRange[] {
  if (daysSorted.length === 0) return [];
  const ranges: RoutePassDayRange[] = [];
  let lo = daysSorted[0];
  let hi = daysSorted[0];
  for (let i = 1; i < daysSorted.length; i += 1) {
    const d = daysSorted[i];
    if (d === hi + 1) {
      hi = d;
    } else {
      ranges.push([lo, hi]);
      lo = d;
      hi = d;
    }
  }
  ranges.push([lo, hi]);
  return ranges;
}

/** Bucket slots by identical (start,end), merge consecutive days per bucket, stable-sort bands. */
export function daySlotsToScheduleBands(slots: DaySlot[]): RoutePassScheduleBand[] {
  const byTime = new Map<string, Set<number>>();
  for (const sl of slots) {
    const key = `${sl.start}\u0000${sl.end}`;
    if (!byTime.has(key)) byTime.set(key, new Set());
    byTime.get(key)!.add(sl.day);
  }

  const bands: RoutePassScheduleBand[] = [];
  const keys = Array.from(byTime.keys()).sort((a, b) => {
    const [as, ae] = a.split('\u0000');
    const [bs, be] = b.split('\u0000');
    if (as !== bs) return as.localeCompare(bs);
    return ae.localeCompare(be);
  });

  for (const key of keys) {
    const [start, end] = key.split('\u0000');
    const days = Array.from(byTime.get(key)!).sort((x, y) => x - y);
    const ranges = mergeConsecutiveDaysToRanges(days);
    bands.push([ranges, start, end]);
  }

  bands.sort((a, b) => {
    const ra = a[0];
    const rb = b[0];
    const fa = ra[0]?.[0] ?? 0;
    const fb = rb[0]?.[0] ?? 0;
    if (fa !== fb) return fa - fb;
    if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
    if (a[2] !== b[2]) return a[2].localeCompare(b[2]);
    return JSON.stringify(ra).localeCompare(JSON.stringify(rb));
  });

  return bands;
}

export function buildFacilitySchedulePayload(
  facilityId: string,
  windows: Pick<ScheduleTimeWindow, 'day_of_week' | 'start_time' | 'end_time'>[],
): RoutePassFacilitySchedule | null {
  const slots = expandScheduleWindowsToDaySlots(windows);
  if (slots.length === 0) return null;
  const w = daySlotsToScheduleBands(slots);
  return { f: facilityId, w };
}

export type LockSerialFacilityRow = { device_serial: string; facility_id: string };

export async function fetchFacilityIdsForLockSerials(
  db: Knex,
  serials: string[],
): Promise<LockSerialFacilityRow[]> {
  if (!serials.length) return [];
  return db('blulok_devices as bd')
    .join('units as u', 'bd.unit_id', 'u.id')
    .whereIn('bd.device_serial', serials)
    .select('bd.device_serial as device_serial', 'u.facility_id as facility_id') as Promise<LockSerialFacilityRow[]>;
}

export type AccessControlFacilityRow = { id: string; facility_id: string };

export async function fetchFacilityIdsForAccessControlDevices(
  db: Knex,
  deviceIds: string[],
): Promise<AccessControlFacilityRow[]> {
  if (!deviceIds.length) return [];
  return db('access_control_devices as acd')
    .join('gateways as g', 'acd.gateway_id', 'g.id')
    .whereIn('acd.id', deviceIds)
    .select('acd.id as id', 'g.facility_id as facility_id') as Promise<AccessControlFacilityRow[]>;
}

/**
 * Distinct facility IDs implied by audiences (locks + shared locks + access_control), stable-sorted.
 */
export async function resolveDistinctFacilityIdsFromAudiences(
  db: Knex,
  audiences: string[],
): Promise<string[]> {
  const parsed = parseRoutePassAudiences(audiences);
  const serials = parsed.lockSerials;
  const [lockRows, acRows] = await Promise.all([
    fetchFacilityIdsForLockSerials(db, serials),
    fetchFacilityIdsForAccessControlDevices(db, parsed.accessControlDeviceIds),
  ]);
  const ids = new Set<string>();
  for (const r of lockRows) {
    if (r.facility_id) ids.add(String(r.facility_id));
  }
  for (const r of acRows) {
    if (r.facility_id) ids.add(String(r.facility_id));
  }
  return Array.from(ids).sort();
}

/** Map lock serial → facility_id for shared-key fallback scoping. */
export function serialToFacilityMap(rows: LockSerialFacilityRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    m.set(String(r.device_serial), String(r.facility_id));
  }
  return m;
}

/**
 * Resolves compact per-facility schedule payloads for everything in `aud` that maps to a facility.
 * Shared-key rows inherit the primary tenant's facility schedule when the pass user has none.
 */
export async function resolveRoutePassSchedulesForAudiences(
  db: Knex,
  userId: string,
  audiences: string[],
): Promise<RoutePassFacilitySchedule[]> {
  const parsed = parseRoutePassAudiences(audiences);
  const [lockRows, acRows] = await Promise.all([
    fetchFacilityIdsForLockSerials(db, parsed.lockSerials),
    fetchFacilityIdsForAccessControlDevices(db, parsed.accessControlDeviceIds),
  ]);
  const ids = new Set<string>();
  for (const r of lockRows) {
    if (r.facility_id) ids.add(String(r.facility_id));
  }
  for (const r of acRows) {
    if (r.facility_id) ids.add(String(r.facility_id));
  }
  const facilityIds = Array.from(ids).sort();
  const serialFac = serialToFacilityMap(lockRows);
  const out: RoutePassFacilitySchedule[] = [];

  for (const facilityId of facilityIds) {
    let timeWindows: Pick<ScheduleTimeWindow, 'day_of_week' | 'start_time' | 'end_time'>[] = [];

    const userSchedule = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
      userId,
      facilityId,
    );
    if (userSchedule?.schedule?.time_windows?.length) {
      timeWindows = userSchedule.schedule.time_windows;
    } else {
      const candidates = parsed.sharedKeys
        .filter((sk) => serialFac.get(sk.lockSerial) === facilityId)
        .sort((a, b) => a.lockSerial.localeCompare(b.lockSerial));
      for (const sk of candidates) {
        const primarySched = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
          sk.primaryTenantId,
          facilityId,
        );
        if (primarySched?.schedule?.time_windows?.length) {
          timeWindows = primarySched.schedule.time_windows;
          break;
        }
      }
    }

    const payload = buildFacilitySchedulePayload(facilityId, timeWindows);
    if (payload) out.push(payload);
  }

  return out;
}
