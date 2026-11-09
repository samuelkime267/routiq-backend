import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const WEBHOOK_EVENT_STATUSES = ["processing", "processed", "ignored"] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

/**
 * Durable idempotency ledger for provider webhooks.
 *
 * The `key` is derived from the provider event and its payload, so a replayed
 * or retried delivery can never apply the same status change twice. The unique
 * index is the concurrency guard; the handler treats duplicate-key errors as a
 * successful no-op.
 */
const providerWebhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      default: "shipbubble",
      required: true,
      trim: true,
      index: true,
    },
    key: { type: String, required: true, unique: true, trim: true },
    eventType: { type: String, default: null, trim: true, index: true },
    providerOrderId: { type: String, default: null, trim: true, index: true },
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipment",
      default: null,
    },
    payloadHash: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: [...WEBHOOK_EVENT_STATUSES],
      default: "processing",
      index: true,
    },
    attempts: { type: Number, default: 1, min: 1 },
    error: { type: String, default: null },
    receivedAt: { type: Date, default: Date.now, index: true },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

providerWebhookEventSchema.index({ provider: 1, receivedAt: -1 });
providerWebhookEventSchema.index({ shipment: 1, receivedAt: -1 });

export type ProviderWebhookEventType = InferSchemaType<
  typeof providerWebhookEventSchema
>;

const ProviderWebhookEvent = mongoose.model(
  "ProviderWebhookEvent",
  providerWebhookEventSchema,
);

export default ProviderWebhookEvent;
export type ProviderWebhookEventDocument = HydratedDocument<ProviderWebhookEventType>;
