import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

/**
 * Statuses that still contribute to gross merchandise value. Cancelled and
 * refunded orders are excluded because the sale did not stand.
 */
export const GMV_ORDER_STATUSES = ORDER_STATUSES.filter(
  (status) => status !== "cancelled" && status !== "refunded",
);

/** Orders that are still moving through fulfilment. */
export const OPEN_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
] as const;

/**
 * Timeline entries that have actually been recorded for an order. The admin
 * timeline endpoint derives additional events from concrete timestamps
 * (payments, shipments) but never invents an event that has no evidence.
 */
export const ORDER_TIMELINE_EVENT_TYPES = [
  "created",
  "payment_confirmed",
  "vendor_notified",
  "processing",
  "shipment_created",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
] as const;
export type OrderTimelineEventType =
  (typeof ORDER_TIMELINE_EVENT_TYPES)[number];

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    /** Whole Naira, captured at purchase time. */
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderShippingAddressSchema = new mongoose.Schema(
  {
    recipientName: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    street: { type: String, default: null, trim: true },
    city: { type: String, default: null, trim: true },
    lga: { type: String, default: null, trim: true },
    state: { type: String, default: null, trim: true },
    country: { type: String, default: "Nigeria", trim: true },
    landmark: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const orderTimelineEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [...ORDER_TIMELINE_EVENT_TYPES],
      required: true,
    },
    occurredAt: { type: Date, required: true },
    description: { type: String, default: null, maxlength: 500 },
    /** `system`, `vendor`, `admin` or `provider`. */
    source: { type: String, default: "system", trim: true },
  },
  { _id: true },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    /**
     * Groups the vendor-specific orders produced by one customer checkout.
     * Legacy orders have no value and act as their own master order.
     */
    masterOrderNumber: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    /** Human-readable label for this vendor-specific fulfilment record. */
    subOrderNumber: { type: String, default: null, trim: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      default: [],
    },
    /** Whole Naira amounts. `total = subtotal + shippingFee - discount`. */
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    discountCode: { type: String, default: null, trim: true },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: [...ORDER_STATUSES],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: [...ORDER_PAYMENT_STATUSES],
      default: "pending",
      index: true,
    },
    shippingCity: { type: String, default: null },
    shippingState: { type: String, default: null },
    shippingAddress: { type: orderShippingAddressSchema, default: null },
    /** Explicit, append-only order events recorded by the owning workflow. */
    timeline: { type: [orderTimelineEventSchema], default: [] },
    placedAt: { type: Date, default: Date.now, index: true },
    expectedDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ masterOrderNumber: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, createdAt: -1 });

export type OrderType = InferSchemaType<typeof orderSchema>;

const Order = mongoose.model("Order", orderSchema);

export default Order;
export type OrderDocument = HydratedDocument<OrderType>;
