import crypto from "node:crypto";
import Escrow from "@/models/escrow.model";
import Order, {
  type OrderDocument,
  type OrderStatus,
  type OrderTimelineEventType,
} from "@/models/order.model";
import Payment from "@/models/payment.model";
import Shipment, { type ShipmentDocument } from "@/models/shipment.model";
import type { StoreDocument } from "@/models/store.model";
import type { UserDocument } from "@/models/user.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { createError } from "@/utils";
import { queryOrders } from "@/services/orders/query";
import { deriveFulfillmentStatus } from "@/services/orders/status";
import { buildOrderTimeline } from "@/services/orders/timeline";
import type { VendorOrderListQuery } from "@/schemas/vendorPortal";
import { assertVendorCanSell } from "./access";

const ORDER_POPULATE = [
  { path: "customer", select: "name email username phone profilePicture status" },
  { path: "store", select: "name slug status logo" },
] as const;

export async function queryVendorOrders(
  vendorId: string,
  query: VendorOrderListQuery,
) {
  return queryOrders({
    page: query.page,
    limit: query.limit,
    search: query.search,
    status: query.status,
    paymentStatus: query.paymentStatus,
    fulfillmentStatus: query.fulfillmentStatus,
    shipmentStatus: query.shipmentStatus,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    // The caller's identity is forced here and is never read from the query.
    vendor: vendorId,
  });
}

export async function findVendorOrder(
  vendorId: string,
  orderId: string,
): Promise<OrderDocument> {
  if (!/^[a-f\d]{24}$/i.test(orderId)) {
    throw createError("Order not found", 404);
  }

  const order = await Order.findOne({ _id: orderId, vendor: vendorId });

  if (!order) throw createError("Order not found", 404);

  return order;
}

function timelineInputForOrder(order: OrderDocument) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    subOrderNumber: order.subOrderNumber ?? null,
    masterOrderNumber: order.masterOrderNumber ?? order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt as Date | undefined,
    placedAt: order.placedAt as Date | undefined,
    updatedAt: order.updatedAt as Date | undefined,
    deliveredAt: order.deliveredAt as Date | undefined,
    cancelledAt: order.cancelledAt as Date | undefined,
    timeline: (order.timeline ?? []).map((event) => ({
      type: event.type,
      occurredAt: event.occurredAt,
      description: event.description,
    })),
  };
}

export async function getVendorOrderDetail(
  vendorId: string,
  orderId: string,
) {
  const order = await findVendorOrder(vendorId, orderId);

  await order.populate([...ORDER_POPULATE]);

  const [shipment, payment, escrow] = await Promise.all([
    Shipment.findOne({ order: order._id }).lean(),
    Payment.findOne({ order: order._id }).sort({ createdAt: -1 }).lean(),
    Escrow.findOne({ order: order._id }).lean(),
  ]);

  const plainShipment = shipment
    ? {
        id: String(shipment._id),
        orderId: String(shipment.order),
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
        deliveredAt: shipment.deliveredAt ?? undefined,
        lastEventAt: shipment.lastEventAt ?? undefined,
        events: (shipment.events ?? []).map((event) => ({
          status: event.status,
          message: event.message,
          occurredAt: event.occurredAt,
        })),
      }
    : null;

  const timeline = buildOrderTimeline({
    orders: [timelineInputForOrder(order)],
    payments: payment
      ? [
          {
            orderId: String(order._id),
            status: payment.status,
            reference: payment.reference,
            paidAt: payment.paidAt,
            createdAt: payment.createdAt as Date | undefined,
          },
        ]
      : [],
    shipments: plainShipment ? [plainShipment] : [],
  });

  return {
    order,
    masterOrderNumber: order.masterOrderNumber ?? order.orderNumber,
    shipment: shipment ?? null,
    payment: payment ?? null,
    escrow: escrow ?? null,
    timeline,
    fulfillmentStatus: deriveFulfillmentStatus(
      order.status,
      shipment?.status ? [shipment.status] : [],
    ),
    /**
     * Vendors see their own fulfilment record only. Other sub-orders from the
     * same checkout are deliberately not loaded or counted.
     */
    scope: "vendor_sub_order" as const,
  };
}

export async function getVendorOrderTimeline(
  vendorId: string,
  orderId: string,
  page: number,
  limit: number,
) {
  const detail = await getVendorOrderDetail(vendorId, orderId);
  const total = detail.timeline.length;
  const skip = (page - 1) * limit;

  return {
    events: detail.timeline.slice(skip, skip + limit),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

function pushTimeline(
  order: OrderDocument,
  type: OrderTimelineEventType,
  description: string,
  occurredAt = new Date(),
) {
  order.timeline.push({
    type,
    occurredAt,
    description,
    source: "vendor",
  });
}

function orderActor(vendor: Pick<UserDocument, "_id" | "name" | "role">) {
  return actorFromUser(vendor);
}

export async function transitionVendorOrder(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  order: OrderDocument,
  target: "confirmed" | "processing" | "delivered" | "cancelled",
  reason?: string | null,
) {
  assertVendorCanSell(store);

  const from = order.status;

  if (target === "confirmed") {
    if (from !== "pending") {
      throw createError(
        `A ${from} order cannot be confirmed. Only pending orders can be confirmed.`,
        400,
      );
    }
    if (order.paymentStatus !== "paid") {
      throw createError(
        "Only paid orders can be confirmed. Wait for the payment to clear first.",
        400,
      );
    }
    order.status = "confirmed";
    pushTimeline(order, "processing", "Order confirmed by the vendor.");
  }

  if (target === "processing") {
    if (from !== "confirmed") {
      throw createError(
        `A ${from} order cannot move to processing. Confirm it first.`,
        400,
      );
    }
    order.status = "processing";
    pushTimeline(order, "processing", "The vendor started preparing the order.");
  }

  if (target === "delivered") {
    if (from !== "shipped") {
      throw createError(
        `A ${from} order cannot be marked delivered. Add shipment tracking first.`,
        400,
      );
    }
    const now = new Date();
    order.status = "delivered";
    order.deliveredAt = now;
    pushTimeline(order, "delivered", "Order delivered to the customer.", now);

    const shipment = await Shipment.findOne({ order: order._id });
    if (shipment && shipment.status !== "delivered") {
      shipment.status = "delivered";
      shipment.providerStatus = "delivered";
      shipment.deliveredAt = now;
      shipment.lastEventAt = now;
      shipment.events.push({
        key: `vendor-delivered-${now.getTime()}`,
        status: "delivered",
        message: "Marked delivered by the vendor.",
        occurredAt: now,
        source: "system",
      });
      await shipment.save();
    }
  }

  if (target === "cancelled") {
    if (!["pending", "confirmed", "processing"].includes(from)) {
      throw createError(
        `A ${from} order cannot be cancelled by the vendor. Contact support for refunds or disputes.`,
        400,
      );
    }
    if (order.paymentStatus === "paid") {
      throw createError(
        "Paid orders cannot be cancelled by the vendor. Open a support request so the payment can be refunded safely.",
        400,
      );
    }
    if (order.status === "processing") {
      throw createError(
        "An order in processing can no longer be cancelled by the vendor.",
        400,
      );
    }
    const now = new Date();
    order.status = "cancelled";
    order.cancelledAt = now;
    pushTimeline(
      order,
      "cancelled",
      reason
        ? `Order cancelled by the vendor: ${reason}`
        : "Order cancelled by the vendor.",
      now,
    );

    const shipment = await Shipment.findOne({ order: order._id });
    if (shipment && !["delivered", "cancelled"].includes(shipment.status)) {
      shipment.status = "cancelled";
      shipment.cancelledAt = now;
      shipment.cancelReason = reason ?? "Cancelled by vendor";
      shipment.lastEventAt = now;
      shipment.events.push({
        key: `vendor-cancelled-${now.getTime()}`,
        status: "cancelled",
        message: shipment.cancelReason,
        occurredAt: now,
        source: "system",
      });
      await shipment.save();
    }
  }

  await order.save();

  await recordActivity({
    type: "order_updated",
    channel: "marketplace",
    title: `Order ${target}`,
    description: `${order.orderNumber} moved from ${from} to ${order.status}.`,
    actor: orderActor(vendor),
    subject: { type: "order", id: order._id, label: order.orderNumber },
    href: `/orders/${order._id}`,
    metadata: { from, to: order.status, reason: reason ?? null },
  });

  return order;
}

function shipmentTrackingNumber() {
  return `RQ-TRK-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${crypto
    .randomInt(100000, 999999)}`;
}

export async function shipVendorOrder(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  order: OrderDocument,
  input: {
    courierName: string;
    trackingNumber: string;
    trackingUrl?: string;
    estimatedDeliveryAt?: string;
    note?: string;
  },
) {
  assertVendorCanSell(store);

  if (order.status !== "processing") {
    throw createError(
      `Only an order in processing can be shipped. This order is ${order.status}.`,
      400,
    );
  }

  if (order.paymentStatus !== "paid") {
    throw createError("Only paid orders can be shipped", 400);
  }

  const now = new Date();
  const estimated = input.estimatedDeliveryAt
    ? new Date(input.estimatedDeliveryAt)
    : null;

  if (estimated && Number.isNaN(estimated.getTime())) {
    throw createError("Enter a valid estimated delivery date", 400);
  }

  let shipment = await Shipment.findOne({ order: order._id });

  if (shipment) {
    if (["delivered", "cancelled", "failed"].includes(shipment.status)) {
      throw createError(
        `This shipment is already ${shipment.status} and cannot be updated.`,
        400,
      );
    }

    shipment.courier = {
      name: input.courierName,
      email: shipment.courier?.email ?? null,
      phone: shipment.courier?.phone ?? null,
      trackingCode: input.trackingNumber,
      trackingMessage: shipment.courier?.trackingMessage ?? null,
    };
    shipment.trackingUrl = input.trackingUrl ?? shipment.trackingUrl ?? null;
    shipment.estimatedDeliveryAt = estimated ?? shipment.estimatedDeliveryAt;
    shipment.status = "in_transit";
    shipment.providerStatus = "in_transit";
    shipment.lastEventAt = now;
    shipment.events.push({
      key: `vendor-shipped-${now.getTime()}`,
      status: "in_transit",
      message:
        input.note ??
        `Handed to ${input.courierName} with tracking ${input.trackingNumber}.`,
      occurredAt: now,
      source: "system",
    });
    await shipment.save();
  } else {
    shipment = await Shipment.create({
      order: order._id,
      trackingNumber: shipmentTrackingNumber(),
      provider: "manual",
      status: "in_transit",
      providerStatus: "in_transit",
      trackingUrl: input.trackingUrl ?? null,
      courier: {
        name: input.courierName,
        trackingCode: input.trackingNumber,
      },
      estimatedDeliveryAt: estimated,
      lastEventAt: now,
      events: [
        {
          key: `vendor-shipped-${now.getTime()}`,
          status: "in_transit",
          message:
            input.note ??
            `Handed to ${input.courierName} with tracking ${input.trackingNumber}.`,
          occurredAt: now,
          source: "system",
        },
      ],
      providerResponse: {
        source: "vendor",
        courierName: input.courierName,
        courierTrackingNumber: input.trackingNumber,
      },
    });
  }

  order.status = "shipped";
  pushTimeline(
    order,
    "shipment_created",
    `Shipment handed to ${input.courierName}. Tracking: ${input.trackingNumber}.`,
    now,
  );
  await order.save();

  await recordActivity({
    type: "shipment_updated",
    channel: "marketplace",
    title: "Order shipped",
    description: `${order.orderNumber} was handed to ${input.courierName}.`,
    actor: orderActor(vendor),
    subject: { type: "order", id: order._id, label: order.orderNumber },
    href: `/orders/${order._id}`,
    metadata: {
      courier: input.courierName,
      trackingNumber: input.trackingNumber,
    },
  });

  return { order, shipment };
}

/** Cancellation is a status transition, exposed separately for clarity. */
export async function cancelVendorOrder(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  order: OrderDocument,
  reason?: string | null,
) {
  const target: OrderStatus = "cancelled";

  return transitionVendorOrder(vendor, store, order, target, reason);
}
