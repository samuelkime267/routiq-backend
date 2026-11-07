import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const SHIPMENT_STATUSES = [
  "pending",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * Delivery record for an order. Shipbubble is the fulfilment provider, so the
 * provider fields mirror its tracking identifiers.
 */
const shipmentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    trackingNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
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
    failureReason: {
      type: String,
      default: null,
    },
    estimatedDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    lastEventAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

shipmentSchema.index({ status: 1, lastEventAt: -1 });

export type ShipmentType = InferSchemaType<typeof shipmentSchema>;

const Shipment = mongoose.model("Shipment", shipmentSchema);

export default Shipment;
export type ShipmentDocument = HydratedDocument<ShipmentType>;
