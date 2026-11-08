import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const ACTIVITY_TYPES = [
  "vendor_registered",
  "store_submitted",
  "store_approved",
  "store_rejected",
  "product_approved",
  "product_rejected",
  "product_suspended",
  "product_restored",
  "order_created",
  "payment_confirmed",
  "shipment_updated",
  "dispute_created",
  "admin_action",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_CHANNELS = ["marketplace", "administration"] as const;
export type ActivityChannel = (typeof ACTIVITY_CHANNELS)[number];

export const ACTIVITY_SUBJECT_TYPES = [
  "vendor",
  "store",
  "product",
  "order",
  "payment",
  "shipment",
  "dispute",
  "admin",
  "platform",
] as const;
export type ActivitySubjectType = (typeof ACTIVITY_SUBJECT_TYPES)[number];

/**
 * Append-only event log for marketplace and administrative activity.
 *
 * Actor details are denormalised on purpose: the dashboard reads the latest
 * events without joining `users`, so rendering the feed is a single indexed
 * query regardless of how many events exist.
 */
const activityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [...ACTIVITY_TYPES],
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: [...ACTIVITY_CHANNELS],
      default: "marketplace",
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: null, maxlength: 500 },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: { type: String, default: "System", trim: true },
    actorRole: { type: String, default: "system", trim: true },
    subjectType: {
      type: String,
      enum: [...ACTIVITY_SUBJECT_TYPES],
      default: "platform",
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subjectLabel: { type: String, default: null, trim: true },
    /** Deep link into the module that owns the event, when one exists. */
    href: { type: String, default: null, trim: true },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

activityEventSchema.index({ createdAt: -1 });

export type ActivityEventType = InferSchemaType<typeof activityEventSchema>;

const ActivityEvent = mongoose.model("ActivityEvent", activityEventSchema);

export default ActivityEvent;
export type ActivityEventDocument = HydratedDocument<ActivityEventType>;
