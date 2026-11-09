import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * Internal shipment states. They are deliberately separate from order and
 * payment states, and every external provider status is mapped onto one of
 * these values by the shipment synchronisation service.
 *
 * `confirmed` and `picked_up` exist because Shipbubble reports them before a
 * package is officially `in_transit`; collapsing them would lose real tracking
 * history.
 */
export const SHIPMENT_STATUSES = [
  "pending",
  "confirmed",
  "picked_up",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_EVENT_SOURCES = [
  "provider",
  "webhook",
  "system",
] as const;
export type ShipmentEventSource = (typeof SHIPMENT_EVENT_SOURCES)[number];

const shipmentCourierSchema = new mongoose.Schema(
  {
    name: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    trackingCode: { type: String, default: null, trim: true },
    trackingMessage: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const shipmentEventSchema = new mongoose.Schema(
  {
    /** Stable hash used to deduplicate provider and webhook payloads. */
    key: { type: String, required: true, trim: true },
    /** Raw provider status, when the event carries one. */
    status: { type: String, default: null, trim: true },
    message: { type: String, default: null, trim: true },
    location: { type: String, default: null, trim: true },
    occurredAt: { type: Date, required: true },
    source: {
      type: String,
      enum: [...SHIPMENT_EVENT_SOURCES],
      default: "provider",
    },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * Delivery record for an order. Shipbubble is the fulfilment provider, so the
 * provider fields mirror its tracking identifiers while the internal `status`
 * remains the source of truth for Rotiq.
 *
 * One master order can contain several vendor sub-orders and therefore several
 * shipments. `order` points at the vendor sub-order, not at the checkout.
 */
const shipmentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    /** Rotiq's public tracking reference. */
    trackingNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    /** Shipbubble's `order_id` (for example `SB-6BAD4363F17C`). */
    providerOrderId: { type: String, default: null, trim: true, index: true },
    provider: {
      type: String,
      default: "shipbubble",
      trim: true,
    },
    status: {
      type: String,
      enum: [...SHIPMENT_STATUSES],
      default: "pending",
      index: true,
    },
    /** Last raw status returned by Shipbubble. */
    providerStatus: { type: String, default: null, trim: true, index: true },
    failureReason: {
      type: String,
      default: null,
    },
    estimatedDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    lastEventAt: { type: Date, default: Date.now, index: true },
    trackingUrl: { type: String, default: null, trim: true },
    courier: { type: shipmentCourierSchema, default: null },
    /** Newest last: the service keeps this ordered and deduplicated. */
    events: { type: [shipmentEventSchema], default: [] },
    /** Latest provider payload, kept for administrative troubleshooting. */
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    providerError: { type: String, default: null },
    lastSyncedAt: { type: Date, default: null },
    lastSyncAttemptAt: { type: Date, default: null },
    syncAttempts: { type: Number, default: 0, min: 0 },
    lastWebhookAt: { type: Date, default: null },
  },
  { timestamps: true },
);

shipmentSchema.index({ status: 1, lastEventAt: -1 });
shipmentSchema.index({ provider: 1, providerOrderId: 1 });
shipmentSchema.index({ order: 1, createdAt: -1 });

export type ShipmentType = InferSchemaType<typeof shipmentSchema>;

const Shipment = mongoose.model("Shipment", shipmentSchema);

export default Shipment;
export type ShipmentDocument = HydratedDocument<ShipmentType>;
