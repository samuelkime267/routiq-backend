import {
  ORDER_TIMELINE_EVENT_TYPES,
  type OrderTimelineEventType,
} from "@/models/order.model";
import { mapShipbubbleStatus } from "@/services/shipments/status";

export interface TimelineOrderInput {
  id: string;
  orderNumber: string;
  subOrderNumber?: string | null;
  masterOrderNumber?: string | null;
  status: string;
  paymentStatus?: string | null;
  createdAt?: Date | string | null;
  placedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  timeline?: Array<{
    type?: string | null;
    occurredAt?: Date | string | null;
    description?: string | null;
  }> | null;
}

export interface TimelinePaymentInput {
  orderId: string;
  status?: string | null;
  reference?: string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface TimelineShipmentEventInput {
  status?: string | null;
  message?: string | null;
  occurredAt?: Date | string | null;
}

export interface TimelineShipmentInput {
  id: string;
  orderId: string;
  trackingNumber?: string | null;
  status: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  lastEventAt?: Date | string | null;
  events?: TimelineShipmentEventInput[] | null;
}

export interface OrderTimelineEvent {
  id: string;
  type: OrderTimelineEventType;
  label: string;
  description: string | null;
  occurredAt: string;
  orderId: string;
  orderNumber: string;
  subOrderNumber: string | null;
  reference: string | null;
}

const EVENT_LABELS: Record<OrderTimelineEventType, string> = {
  created: "Order created",
  payment_confirmed: "Payment confirmed",
  vendor_notified: "Vendor notified",
  processing: "Processing",
  shipment_created: "Shipment created",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  completed: "Order completed",
  cancelled: "Order cancelled",
  refunded: "Order refunded",
};

const EVENT_RANK: Record<OrderTimelineEventType, number> = {
  created: 1,
  payment_confirmed: 2,
  vendor_notified: 3,
  processing: 4,
  shipment_created: 5,
  picked_up: 6,
  in_transit: 7,
  delivered: 8,
  completed: 9,
  cancelled: 10,
  refunded: 11,
};

const KNOWN_TYPES = new Set<string>(ORDER_TIMELINE_EVENT_TYPES);

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isTimelineType(value: string): value is OrderTimelineEventType {
  return KNOWN_TYPES.has(value);
}

interface TimelineCollector {
  byId: Map<string, OrderTimelineEvent>;
}

function pushEvent(
  collector: TimelineCollector,
  input: {
    id: string;
    type: OrderTimelineEventType;
    occurredAt: Date;
    description?: string | null;
    order: TimelineOrderInput;
    reference?: string | null;
  },
) {
  if (collector.byId.has(input.id)) return;

  collector.byId.set(input.id, {
    id: input.id,
    type: input.type,
    label: EVENT_LABELS[input.type],
    description: input.description ?? null,
    occurredAt: input.occurredAt.toISOString(),
    orderId: input.order.id,
    orderNumber: input.order.orderNumber,
    subOrderNumber: input.order.subOrderNumber ?? null,
    reference: input.reference ?? null,
  });
}

/**
 * Builds the administrative order timeline from evidence that actually
 * exists: explicit order events plus concrete payment, shipment and delivery
 * timestamps. It never adds an event merely because an order could have moved
 * through that stage.
 */
export function buildOrderTimeline(input: {
  orders: TimelineOrderInput[];
  payments?: TimelinePaymentInput[];
  shipments?: TimelineShipmentInput[];
}): OrderTimelineEvent[] {
  const collector: TimelineCollector = { byId: new Map() };
  const paymentsByOrder = new Map<string, TimelinePaymentInput[]>();
  const shipmentsByOrder = new Map<string, TimelineShipmentInput[]>();

  for (const payment of input.payments ?? []) {
    const existing = paymentsByOrder.get(payment.orderId) ?? [];
    existing.push(payment);
    paymentsByOrder.set(payment.orderId, existing);
  }

  for (const shipment of input.shipments ?? []) {
    const existing = shipmentsByOrder.get(shipment.orderId) ?? [];
    existing.push(shipment);
    shipmentsByOrder.set(shipment.orderId, existing);
  }

  for (const order of input.orders) {
    const explicitTypes = new Set<OrderTimelineEventType>();

    for (const [index, event] of (order.timeline ?? []).entries()) {
      if (!event.type || !isTimelineType(event.type)) continue;

      const occurredAt = toDate(event.occurredAt);
      if (!occurredAt) continue;

      explicitTypes.add(event.type);
      pushEvent(collector, {
        id: `${order.id}:event:${event.type}:${occurredAt.toISOString()}:${index}`,
        type: event.type,
        occurredAt,
        description: event.description ?? null,
        order,
      });
    }

    const createdAt = toDate(order.placedAt) ?? toDate(order.createdAt);
    if (createdAt && !explicitTypes.has("created")) {
      pushEvent(collector, {
        id: `${order.id}:created`,
        type: "created",
        occurredAt: createdAt,
        description: `${order.orderNumber} was placed.`,
        order,
      });
    }

    if (!explicitTypes.has("payment_confirmed")) {
      const successfulPayment = (paymentsByOrder.get(order.id) ?? []).find(
        (payment) => payment.status === "successful",
      );

      if (successfulPayment) {
        const paidAt =
          toDate(successfulPayment.paidAt) ?? toDate(successfulPayment.createdAt);

        if (paidAt) {
          pushEvent(collector, {
            id: `${order.id}:payment_confirmed`,
            type: "payment_confirmed",
            occurredAt: paidAt,
            description: successfulPayment.reference
              ? `Payment ${successfulPayment.reference} was confirmed.`
              : "The order payment was confirmed.",
            order,
            reference: successfulPayment.reference ?? null,
          });
        }
      }
    }

    if (order.status === "delivered" && !explicitTypes.has("completed")) {
      const completedAt =
        toDate(order.deliveredAt) ?? toDate(order.updatedAt) ?? toDate(order.createdAt);

      if (completedAt) {
        pushEvent(collector, {
          id: `${order.id}:completed`,
          type: "completed",
          occurredAt: completedAt,
          description: `${order.orderNumber} was completed.`,
          order,
        });
      }
    }

    if (
      (order.status === "cancelled" || order.status === "refunded") &&
      !explicitTypes.has("cancelled") &&
      !explicitTypes.has("refunded")
    ) {
      const cancelledAt =
        toDate(order.cancelledAt) ?? toDate(order.updatedAt) ?? toDate(order.createdAt);

      if (cancelledAt) {
        const type: OrderTimelineEventType =
          order.status === "refunded" ? "refunded" : "cancelled";

        pushEvent(collector, {
          id: `${order.id}:${type}`,
          type,
          occurredAt: cancelledAt,
          description: `${order.orderNumber} was ${type}.`,
          order,
        });
      }
    }

    for (const shipment of shipmentsByOrder.get(order.id) ?? []) {
      const shipmentCreatedAt =
        toDate(shipment.createdAt) ?? toDate(shipment.lastEventAt);
      const tracking = shipment.trackingNumber ?? "shipment";

      if (shipmentCreatedAt && !explicitTypes.has("shipment_created")) {
        pushEvent(collector, {
          id: `${order.id}:shipment:${shipment.id}:created`,
          type: "shipment_created",
          occurredAt: shipmentCreatedAt,
          description: `${tracking} was created for ${order.orderNumber}.`,
          order,
          reference: shipment.trackingNumber ?? null,
        });
      }

      const sortedEvents = [...(shipment.events ?? [])].sort((left, right) => {
        const leftDate = toDate(left.occurredAt)?.getTime() ?? 0;
        const rightDate = toDate(right.occurredAt)?.getTime() ?? 0;

        return leftDate - rightDate;
      });
      const trackedStatuses = new Set<OrderTimelineEventType>();

      for (const [index, event] of sortedEvents.entries()) {
        const occurredAt = toDate(event.occurredAt);
        if (!occurredAt) continue;

        const mapped = mapShipbubbleStatus(event.status);
        const type =
          mapped === "picked_up" || mapped === "in_transit" || mapped === "delivered"
            ? mapped
            : null;

        if (!type) continue;

        trackedStatuses.add(type);
        pushEvent(collector, {
          id: `${order.id}:shipment:${shipment.id}:event:${mapped}:${occurredAt.toISOString()}:${index}`,
          type,
          occurredAt,
          description: event.message ?? `${tracking} is ${EVENT_LABELS[type].toLowerCase()}.`,
          order,
          reference: shipment.trackingNumber ?? null,
        });
      }

      const shipmentStatus = mapShipbubbleStatus(shipment.status);
      const fallbackStatusAt =
        toDate(shipment.lastEventAt) ??
        toDate(shipment.updatedAt) ??
        shipmentCreatedAt;

      if (
        shipmentStatus === "picked_up" &&
        fallbackStatusAt &&
        !trackedStatuses.has("picked_up")
      ) {
        pushEvent(collector, {
          id: `${order.id}:shipment:${shipment.id}:picked_up`,
          type: "picked_up",
          occurredAt: fallbackStatusAt,
          description: `${tracking} was picked up by the courier.`,
          order,
          reference: shipment.trackingNumber ?? null,
        });
      }

      if (
        shipmentStatus === "in_transit" &&
        fallbackStatusAt &&
        !trackedStatuses.has("in_transit")
      ) {
        pushEvent(collector, {
          id: `${order.id}:shipment:${shipment.id}:in_transit`,
          type: "in_transit",
          occurredAt: fallbackStatusAt,
          description: `${tracking} is in transit.`,
          order,
          reference: shipment.trackingNumber ?? null,
        });
      }

      if (shipmentStatus === "delivered" && !trackedStatuses.has("delivered")) {
        const deliveredAt =
          toDate(shipment.deliveredAt) ??
          toDate(shipment.lastEventAt) ??
          fallbackStatusAt;

        if (deliveredAt && !explicitTypes.has("delivered")) {
          pushEvent(collector, {
            id: `${order.id}:shipment:${shipment.id}:delivered`,
            type: "delivered",
            occurredAt: deliveredAt,
            description: `${tracking} was delivered.`,
            order,
            reference: shipment.trackingNumber ?? null,
          });
        }
      }
    }
  }

  return [...collector.byId.values()].sort((left, right) => {
    const timeDiff =
      new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();

    if (timeDiff !== 0) return timeDiff;

    return EVENT_RANK[left.type] - EVENT_RANK[right.type];
  });
}

export function paginateTimeline(
  events: OrderTimelineEvent[],
  page: number,
  limit: number,
) {
  const total = events.length;
  const skip = (page - 1) * limit;

  return {
    events: events.slice(skip, skip + limit),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}
