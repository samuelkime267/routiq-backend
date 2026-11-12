import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * Append-only administrative audit trail.
 *
 * Records are written by `lib/audit.ts` after a mutation succeeds. There is no
 * API to update or delete them, and the model-level hooks below reject
 * application-level mutations so a controller cannot rewrite history.
 */
export const AUDIT_ENTITY_TYPES = [
  "admin",
  "admin_role",
  "invitation",
  "user",
  "vendor",
  "store",
  "product",
  "order",
  "payment",
  "escrow",
  "shipment",
  "dispute",
  "settings",
  "platform",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "admin.login",
  "admin.invited",
  "admin.invitation_resent",
  "admin.invitation_revoked",
  "admin.invitation_accepted",
  "admin.role_changed",
  "admin.status_changed",
  "admin.permissions_changed",
  "admin.profile_updated",
  "admin.password_reset",
  "admin_role.created",
  "admin_role.updated",
  "admin_role.deleted",
  "user.status_changed",
  "user.role_changed",
  "vendor.status_changed",
  "vendor.note_added",
  "store.approved",
  "store.rejected",
  "store.information_requested",
  "store.suspended",
  "store.reactivated",
  "product.approved",
  "product.rejected",
  "product.suspended",
  "product.restored",
  "shipment.refreshed",
  "shipment.retried",
  "shipment.cancelled",
  "dispute.assigned",
  "dispute.status_changed",
  "dispute.note_added",
  "dispute.resolved",
  "settings.updated",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number] | string;

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorName: { type: String, default: "System", trim: true },
    actorEmail: { type: String, default: null, trim: true, lowercase: true },
    actorRole: { type: String, default: "system", trim: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: {
      type: String,
      required: true,
      enum: [...AUDIT_ENTITY_TYPES],
      index: true,
    },
    entityId: { type: String, default: null, index: true },
    entityLabel: { type: String, default: null, trim: true },
    previousState: { type: mongoose.Schema.Types.Mixed, default: null },
    newState: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: null, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    method: { type: String, default: null },
    path: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    // Audit rows are immutable; only the creation time is tracked.
    timestamps: false,
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

const immutable = () => {
  throw new Error("Audit records are append-only and cannot be modified");
};

auditLogSchema.pre("save", function blockExistingSave() {
  if (!this.isNew) immutable();
});

auditLogSchema.pre("updateOne", immutable);
auditLogSchema.pre("updateMany", immutable);
auditLogSchema.pre("findOneAndUpdate", immutable);
auditLogSchema.pre("replaceOne", immutable);
auditLogSchema.pre("deleteOne", immutable);
auditLogSchema.pre("deleteMany", immutable);
auditLogSchema.pre("findOneAndDelete", immutable);

export type AuditLogType = InferSchemaType<typeof auditLogSchema>;

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
export type AuditLogDocument = HydratedDocument<AuditLogType>;
