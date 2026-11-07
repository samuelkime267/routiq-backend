import {
  BUSINESS_TIMEZONE,
  BUSINESS_TIMEZONE_OFFSET_MINUTES,
} from "@/config/marketplace";
import { createError } from "@/utils/createError";

export const DASHBOARD_RANGES = [
  "today",
  "7d",
  "30d",
  "90d",
  "custom",
] as const;
export type DashboardRangeKey = (typeof DASHBOARD_RANGES)[number];

export type DashboardGranularity = "hour" | "day";

export interface DashboardRange {
  key: DashboardRangeKey;
  label: string;
  /** Inclusive start of the reporting window. */
  start: Date;
  /** Exclusive end of the reporting window (clamped to "now"). */
  end: Date;
  granularity: DashboardGranularity;
  timezone: string;
}

export interface DashboardRangeInput {
  range?: DashboardRangeKey;
  from?: string;
  to?: string;
}

const OFFSET_MS = BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_CUSTOM_RANGE_DAYS = 366;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, "0");

/** Lagos wall-clock parts for an instant (Lagos is UTC+1 all year). */
function lagosParts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

/** The instant at which the Lagos calendar day containing `date` starts. */
export function startOfLagosDay(date: Date): Date {
  const parts = lagosParts(date);

  return new Date(
    Date.UTC(parts.year, parts.month, parts.day) - OFFSET_MS,
  );
}

/** The instant at which the Lagos hour containing `date` starts. */
export function startOfLagosHour(date: Date): Date {
  const parts = lagosParts(date);

  return new Date(
    Date.UTC(parts.year, parts.month, parts.day, parts.hour) - OFFSET_MS,
  );
}

export const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

export const addHours = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

/** Parses a `YYYY-MM-DD` calendar date, rejecting impossible dates. */
export function parseDateKey(value: string): Date {
  const match = DATE_KEY.exec(value);

  if (!match) {
    throw createError("Use the YYYY-MM-DD format for custom range dates", 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createError("That date does not exist", 400);
  }

  return date;
}

/** Mongo `$dateToString` format string matching the bucket granularity. */
export function bucketFormat(granularity: DashboardGranularity) {
  return granularity === "hour" ? "%Y-%m-%dT%H" : "%Y-%m-%d";
}

/** Stable bucket key in Lagos local time, e.g. `2026-11-04` or `2026-11-04T09`. */
export function bucketKey(date: Date, granularity: DashboardGranularity) {
  const parts = lagosParts(date);
  const day = `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;

  return granularity === "hour" ? `${day}T${pad(parts.hour)}` : day;
}

const shortDate = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Human label for a bucket key, e.g. `4 Nov` or `09:00`. */
export function bucketLabel(key: string, granularity: DashboardGranularity) {
  if (granularity === "hour") return `${key.slice(11, 13)}:00`;

  const date = new Date(`${key}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? key : shortDate.format(date);
}

const rangeDate = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDateKey(date: Date) {
  return rangeDate.format(date);
}

function resolvePreset(
  key: Exclude<DashboardRangeKey, "custom">,
  now: Date,
): DashboardRange {
  const today = startOfLagosDay(now);

  if (key === "today") {
    return {
      key,
      label: "Today",
      start: today,
      end: now,
      granularity: "hour",
      timezone: BUSINESS_TIMEZONE,
    };
  }

  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;

  return {
    key,
    label: `Last ${days} days`,
    start: addDays(today, -(days - 1)),
    end: now,
    granularity: "day",
    timezone: BUSINESS_TIMEZONE,
  };
}

/**
 * Resolves a requested reporting window into concrete instants.
 *
 * Presets end "now" so the current day is never shown as empty. Custom ranges
 * are inclusive calendar days in the marketplace timezone; the end is clamped
 * to now so a range that includes today does not report future activity.
 */
export function resolveDashboardRange(
  input: DashboardRangeInput,
  now: Date = new Date(),
): DashboardRange {
  const key = input.range ?? "7d";

  if (key !== "custom") {
    return resolvePreset(key, now);
  }

  if (!input.from || !input.to) {
    throw createError(
      "A custom range needs both a start and an end date",
      400,
    );
  }

  const fromKey = parseDateKey(input.from);
  const toKey = parseDateKey(input.to);

  if (fromKey.getTime() > toKey.getTime()) {
    throw createError("The start date must be on or before the end date", 400);
  }

  const spanDays = Math.round((toKey.getTime() - fromKey.getTime()) / DAY_MS) + 1;

  if (spanDays > MAX_CUSTOM_RANGE_DAYS) {
    throw createError(
      `Custom ranges are limited to ${MAX_CUSTOM_RANGE_DAYS} days`,
      400,
    );
  }

  const start = startOfLagosDay(fromKey);
  const requestedEnd = addDays(startOfLagosDay(toKey), 1);
  const end = new Date(Math.min(requestedEnd.getTime(), now.getTime()));

  if (end.getTime() <= start.getTime()) {
    throw createError("The selected range starts in the future", 400);
  }

  const sameDay = fromKey.getTime() === toKey.getTime();

  return {
    key,
    label: sameDay
      ? formatDateKey(fromKey)
      : `${formatDateKey(fromKey)} – ${formatDateKey(toKey)}`,
    start,
    end,
    granularity: spanDays <= 2 ? "hour" : "day",
    timezone: BUSINESS_TIMEZONE,
  };
}

/** The equal-length window immediately before the current range. */
export function previousRange(range: DashboardRange): {
  start: Date;
  end: Date;
} {
  const duration = Math.max(range.end.getTime() - range.start.getTime(), 1);

  return {
    start: new Date(range.start.getTime() - duration),
    end: range.start,
  };
}

/** Bucket start instants covered by the range, oldest first. */
export function rangeBuckets(range: DashboardRange): Date[] {
  const anchor =
    range.granularity === "hour"
      ? startOfLagosHour(range.start)
      : startOfLagosDay(range.start);
  const stepMs =
    range.granularity === "hour" ? 60 * 60 * 1000 : DAY_MS;
  const buckets: Date[] = [];

  for (
    let cursor = anchor.getTime();
    cursor < range.end.getTime();
    cursor += stepMs
  ) {
    buckets.push(new Date(cursor));
  }

  return buckets;
}

export function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;

  return Math.round(((current - previous) / previous) * 1000) / 10;
}
