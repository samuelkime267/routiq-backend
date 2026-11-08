import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const NOTIFICATION_TYPES = [
  "store_submitted",
  "store_approved",
  "store_rejected",
  "store_information_requested",
  "store_suspended",
  "store_reactivated",
  "vendor_suspended",
  "vendor_reactivated",
  "product_approved",
  "product_rejected",
  "product_suspended",
  "product_restored",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * In-app notification delivered to a user account.
 *
 * Notifications are separate from the administrative activity feed: activity
 * is the audit trail for admins, notifications are the vendor-facing message
 * that explains what happened to their business.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [...NOTIFICATION_TYPES],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    href: {
      type: String,
      default: null,
      trim: true,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

export type NotificationTypeSchema = InferSchemaType<typeof notificationSchema>;

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
export type NotificationDocument = HydratedDocument<NotificationTypeSchema>;
