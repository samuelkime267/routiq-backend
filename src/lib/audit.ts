import mongoose from "mongoose";
import AuditLog from "@/models/auditLog.model";
import type { AuditEntityType } from "@/models/auditLog.model";

export interface AuditActor {
  id?: unknown;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface AuditRequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
}

export interface AuditInput {
  actor?: AuditActor | null;
  action: string;
  entityType: AuditEntityType;
  entityId?: unknown;
  entityLabel?: string | null;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  request?: AuditRequestMeta;
}

/**
 * Builds the actor snapshot stored with an audit row. The administrative role
 * is preferred over the shared `role` field because it identifies the actual
 * authority used for the action.
 */
export function auditActorFromUser(
  user:
    | {
        _id?: unknown;
        name?: string | null;
        email?: string | null;
        role?: string | null;
        adminRole?: string | null;
      }
    | null
    | undefined,
): AuditActor {
  return {
    id: user?._id ?? null,
    name: user?.name ?? "System",
    email: user?.email ?? null,
    role: user?.adminRole ?? user?.role ?? "system",
  };
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}

export function requestMetadata(req: {
  ip?: string;
  headers?: Record<string, unknown>;
  method?: string;
  originalUrl?: string;
  baseUrl?: string;
  path?: string;
  socket?: { remoteAddress?: string };
}): AuditRequestMeta {
  const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
  const forwarded = firstHeader(headers["x-forwarded-for"]);

  return {
    ipAddress:
      forwarded?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null,
    userAgent: firstHeader(headers["user-agent"]),
    method: req.method ?? null,
    path: req.originalUrl ?? req.path ?? null,
  };
}

function serialiseId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Appends an administrative audit record.
 *
 * Auditing is a side effect: a logging failure must never roll back the action
 * that was already saved. The connection guard mirrors `recordActivity` and
 * keeps unit tests that do not open Mongo from buffering writes.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  try {
    await AuditLog.create({
      actor: input.actor?.id ?? null,
      actorName: input.actor?.name ?? "System",
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.role ?? "system",
      action: input.action,
      entityType: input.entityType,
      entityId: serialiseId(input.entityId),
      entityLabel: input.entityLabel ?? null,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      ipAddress: input.request?.ipAddress ?? null,
      userAgent: input.request?.userAgent ?? null,
      method: input.request?.method ?? null,
      path: input.request?.path ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record audit entry", error);
  }
}
