/**
 * Central date/time utilities for the BluLok backend.
 *
 * Storage: MySQL instants are written and read as UTC (mysql2 timezone: 'Z').
 * Wire: ISO-8601 UTC strings with Z suffix.
 */

import { resolveFacilityTimeZone } from '@/constants/facility-timezones';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize any instant to ISO-8601 UTC for API / WebSocket responses. */
export function toIsoString(value: Date | string | number | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Non-null ISO string; falls back to epoch when input is invalid (legacy access-history behavior). */
export function toIsoStringOrEpoch(value: Date | string | number | null | undefined): string {
  return toIsoString(value) ?? new Date(0).toISOString();
}

export function parseInstant(value: string): Date {
  return new Date(value);
}

/**
 * Lower bound for query filters.
 * - `YYYY-MM-DD` → start of that UTC calendar day (legacy clients).
 * - Full ISO-8601 → parsed as-is (preferred; send local-day bounds from the frontend).
 */
export function parseQueryDateFrom(value: string): Date {
  if (DATE_ONLY_RE.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

/**
 * Upper bound for query filters.
 * - `YYYY-MM-DD` → end of that UTC calendar day (legacy clients).
 * - Full ISO-8601 → parsed as-is.
 */
export function parseQueryDateTo(value: string): Date {
  if (DATE_ONLY_RE.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}

/** @deprecated Use parseQueryDateFrom — kept for existing imports. */
export const parseAccessHistoryDateFrom = parseQueryDateFrom;

/** @deprecated Use parseQueryDateTo — kept for existing imports. */
export const parseAccessHistoryDateTo = parseQueryDateTo;

/** Long date for notification templates in the facility timezone. */
export function formatNotificationDate(date: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveFacilityTimeZone(timeZone),
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** Clock time for notification templates (`11:05 AM MDT`). */
export function formatNotificationTime(date: Date, timeZone?: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveFacilityTimeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date).replace(/\u202f/g, ' ');
}

/** Combined instant for invite expiry (`September 6, 2026 at 11:05 AM MDT`). */
export function formatNotificationDateTime(date: Date, timeZone?: string | null): string {
  return `${formatNotificationDate(date, timeZone)} at ${formatNotificationTime(date, timeZone)}`;
}
