import mongoose from "mongoose";
import ActivityEvent, {
  type ActivityChannel,
  type ActivitySubjectType,
  type ActivityType,
} from "@/models/activityEvent.model";

export interface ActivityActor {
  id?: unknown;
  name: string;
  role: string;
}

export interface ActivitySubject {
  type: ActivitySubjectType;
  id?: unknown;
  label?: string | null;
}

export interface ActivityInput {
  type: ActivityType;
  channel?: ActivityChannel;
  title: string;
  description?: string | null;
  actor?: ActivityActor;
  subject?: ActivitySubject;
  href?: string | null;
  metadata?: Record<string, unknown>;
  /** Historical timestamp, used when backfilling events from seed data. */
  occurredAt?: Date;
}

/**
 * Appends an event to the activity feed.
 *
 * Logging must never break the operation it describes, so failures are
 * swallowed after being reported. The connection guard keeps unit tests (which
 * never open a database connection) from buffering writes.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  try {
    await ActivityEvent.create({
      type: input.type,
      channel: input.channel ?? "marketplace",
      title: input.title,
      description: input.description ?? null,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? "System",
      actorRole: input.actor?.role ?? "system",
      subjectType: input.subject?.type ?? "platform",
      subjectId: input.subject?.id ?? null,
      subjectLabel: input.subject?.label ?? null,
      href: input.href ?? null,
      metadata: input.metadata ?? {},
      ...(input.occurredAt
        ? { createdAt: input.occurredAt, updatedAt: input.occurredAt }
        : {}),
    });
  } catch (error) {
    console.error("[activity] failed to record event", error);
  }
}

export function actorFromUser(user: {
  _id?: unknown;
  name?: string | null;
  role?: string | null;
  adminRole?: string | null;
} | null | undefined): ActivityActor {
  return {
    id: user?._id,
    name: user?.name ?? "System",
    role: user?.adminRole ?? user?.role ?? "system",
  };
}
