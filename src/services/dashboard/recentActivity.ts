import ActivityEvent from "@/models/activityEvent.model";
import type { DashboardActivityItem } from "./types";
import type { DashboardRange } from "./range";

interface RecentActivityOptions {
  limit?: number;
  /** Omit to return the latest events regardless of period. */
  range?: DashboardRange;
}

interface ActivityRow {
  _id: unknown;
  type: string;
  channel: "marketplace" | "administration";
  title: string;
  description?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  subjectType?: string | null;
  subjectLabel?: string | null;
  href?: string | null;
  createdAt?: Date | string | null;
}

function toIso(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();

  const date = new Date(value ?? 0);

  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

/**
 * Latest activity feed entries. Actor details are denormalised on the event, so
 * this is a single indexed read with no joins.
 */
export async function getRecentActivity({
  limit = 10,
  range,
}: RecentActivityOptions = {}): Promise<DashboardActivityItem[]> {
  const filter = range
    ? { createdAt: { $gte: range.start, $lt: range.end } }
    : {};

  const rows = (await ActivityEvent.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean()) as unknown as ActivityRow[];

  return rows.map((row) => ({
    id: String(row._id),
    type: row.type,
    channel: row.channel,
    title: row.title,
    description: row.description ?? null,
    actorName: row.actorName ?? "System",
    actorRole: row.actorRole ?? "system",
    subjectType: row.subjectType ?? "platform",
    subjectLabel: row.subjectLabel ?? null,
    href: row.href ?? null,
    createdAt: toIso(row.createdAt),
  }));
}
