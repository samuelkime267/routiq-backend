import type {
  OrderPaymentStatus,
  OrderStatus,
} from "@/models/order.model";
import type { ShipmentStatus } from "@/models/shipment.model";

/**
 * Fulfilment is a presentation of the order plus its shipment records. It is
 * intentionally not stored on the order, so the order, payment and shipment
 * states stay independent.
 */
export const FULFILLMENT_STATUSES = [
  "unfulfilled",
  "processing",
  "shipped",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

const ACTIVE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "confirmed",
  "picked_up",
  "in_transit",
];

export function deriveFulfillmentStatus(
  orderStatus: string,
  shipmentStatuses: readonly string[] = [],
): FulfillmentStatus {
  if (orderStatus === "cancelled" || orderStatus === "refunded") {
    return "cancelled";
  }

  if (orderStatus === "delivered" || shipmentStatuses.includes("delivered")) {
    return "delivered";
  }

  // A failed shipment remains visible even when the order itself has not been
  // cancelled. This is the queue operations admins need to resolve.
  if (shipmentStatuses.includes("failed")) return "failed";

  if (
    orderStatus === "shipped" ||
    shipmentStatuses.some((status) =>
      ACTIVE_SHIPMENT_STATUSES.includes(status as ShipmentStatus),
    )
  ) {
    return "shipped";
  }

  if (orderStatus === "processing") return "processing";

  return "unfulfilled";
}

/** Order statuses that can produce a given derived fulfilment state. */
export const FULFILLMENT_ORDER_STATUSES: Record<
  Exclude<FulfillmentStatus, "failed">,
  readonly OrderStatus[]
> = {
  unfulfilled: ["pending", "confirmed"],
  processing: ["processing"],
  shipped: ["shipped"],
  delivered: ["delivered"],
  cancelled: ["cancelled", "refunded"],
};

/**
 * Collapses the vendor sub-orders of one checkout into a master-order status.
 * The most progressed active state wins; the master is only `delivered` when
 * every sub-order is delivered.
 */
export function deriveMasterOrderStatus(
  statuses: readonly string[],
): OrderStatus {
  if (!statuses.length) return "pending";

  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.every((status) => status === "refunded")) return "refunded";
  if (statuses.some((status) => status === "shipped")) return "shipped";
  if (statuses.some((status) => status === "processing")) return "processing";
  if (statuses.some((status) => status === "confirmed")) return "confirmed";

  return "pending";
}

/**
 * Master-order payment summary. A checkout is only fully paid when every
 * vendor sub-order payment succeeded; any refund is surfaced ahead of paid.
 */
export function deriveMasterPaymentStatus(
  statuses: readonly string[],
): OrderPaymentStatus {
  if (!statuses.length) return "pending";
  if (statuses.some((status) => status === "refunded")) return "refunded";
  if (statuses.every((status) => status === "paid")) return "paid";
  if (statuses.some((status) => status === "failed")) return "failed";

  return "pending";
}

/**
 * Order status changes caused by a provider shipment update. Failed and
 * cancelled shipments never cancel the order automatically: those remain
 * operator decisions.
 */
export function nextOrderStatusFromShipment(
  orderStatus: string,
  shipmentStatus: ShipmentStatus,
): OrderStatus | null {
  if (orderStatus === "cancelled" || orderStatus === "refunded") return null;

  if (shipmentStatus === "delivered" && orderStatus !== "delivered") {
    return "delivered";
  }

  if (
    ACTIVE_SHIPMENT_STATUSES.includes(shipmentStatus) &&
    ["pending", "confirmed", "processing"].includes(orderStatus)
  ) {
    return "shipped";
  }

  return null;
}
