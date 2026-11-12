import type { AdminInvitationDocument } from "@/models/adminInvitation.model";

export interface AdminInvitationView {
  _id: string;
  admin: unknown;
  name: string;
  email: string;
  adminRole: string;
  status: string;
  expiresAt: string | null;
  invitedBy: unknown;
  acceptedAt: string | null;
  revokedAt: string | null;
  revokedBy: unknown;
  lastSentAt: string | null;
  sendCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  isExpired: boolean;
}

/**
 * Removes the token hash and normalises dates. The raw token only ever exists
 * in the invitation email; the hash must never reach a client.
 */
export function serialiseAdminInvitation(
  invitation: AdminInvitationDocument,
): AdminInvitationView {
  const json = invitation.toObject() as Record<string, unknown>;
  delete json.tokenHash;

  const expiresAt = json.expiresAt ? new Date(String(json.expiresAt)) : null;

  return {
    _id: String(json._id),
    admin: json.admin ?? null,
    name: String(json.name ?? ""),
    email: String(json.email ?? ""),
    adminRole: String(json.adminRole ?? ""),
    status: String(json.status ?? "PENDING"),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    invitedBy: json.invitedBy ?? null,
    acceptedAt: json.acceptedAt
      ? new Date(String(json.acceptedAt)).toISOString()
      : null,
    revokedAt: json.revokedAt
      ? new Date(String(json.revokedAt)).toISOString()
      : null,
    revokedBy: json.revokedBy ?? null,
    lastSentAt: json.lastSentAt
      ? new Date(String(json.lastSentAt)).toISOString()
      : null,
    sendCount: Number(json.sendCount ?? 0),
    createdAt: json.createdAt
      ? new Date(String(json.createdAt)).toISOString()
      : null,
    updatedAt: json.updatedAt
      ? new Date(String(json.updatedAt)).toISOString()
      : null,
    isExpired: Boolean(expiresAt && expiresAt.getTime() <= Date.now()),
  };
}
