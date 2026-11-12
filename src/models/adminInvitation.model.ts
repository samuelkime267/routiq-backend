import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * A single-use administrative invitation.
 *
 * The raw token is only ever sent by email; only its hash is stored here. A
 * document is mutable for lifecycle transitions (resend, revoke, accept), but
 * its token can only be consumed once.
 */
export const ADMIN_INVITATION_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
] as const;
export type AdminInvitationStatus =
  (typeof ADMIN_INVITATION_STATUSES)[number];

const adminInvitationSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    adminRole: { type: String, required: true, trim: true },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    status: {
      type: String,
      enum: [...ADMIN_INVITATION_STATUSES],
      default: "PENDING",
      index: true,
    },
    expiresAt: { type: Date, required: true },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastSentAt: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true },
);

adminInvitationSchema.index({ status: 1, expiresAt: 1 });
adminInvitationSchema.index({ createdAt: -1 });

export type AdminInvitationType = InferSchemaType<
  typeof adminInvitationSchema
>;

const AdminInvitation = mongoose.model(
  "AdminInvitation",
  adminInvitationSchema,
);

export default AdminInvitation;
export type AdminInvitationDocument =
  HydratedDocument<AdminInvitationType>;
