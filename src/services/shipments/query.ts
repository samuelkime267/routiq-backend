import mongoose from "mongoose";
import Order, { type OrderDocument } from "@/models/order.model";
import Shipment, {
  SHIPMENT_STATUSES,
  type ShipmentDocument,
} from "@/models/shipment.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import type {
  ListShipmentsQuery,
  ShipmentTrackingQuery,
} from "@/schemas/shipment";
import { createError } from "@/utils";

export const SHIPMENT_ORDER_POPULATE = [
  { path: "customer", select: "name email username profilePicture phone" },
  { path: "vendor", select: "name email username profilePicture status" },
  { path: "store", select: "name slug status category logo" },
] as const;

const isObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const regex = (value: string) => new RegExp(escapeRegExp(value), "i");

function endOfDayIfDateOnly(value: string) {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

async function resolveOrderIds(input: {
  order?: string;
  vendor?: string;
  customer?: string;
  store?: string;
}): Promise<mongoose.Types.ObjectId[] | null> {
  const clauses: Record<string, unknown>[] = [];

  if (input.order) {
    clauses.push(
      isObjectId(input.order)
        ? { _id: new mongoose.Types.ObjectId(input.order) }
        : {
            $or: [
              { orderNumber: regex(input.order) },
              { masterOrderNumber: regex(input.order) },
              { subOrderNumber: regex(input.order) },
            ],
          },
    );
  }

  if (input.vendor) {
    if (isObjectId(input.vendor)) {
      clauses.push({ vendor: new mongoose.Types.ObjectId(input.vendor) });
    } else {
      const vendorIds = await User.find({
        $or: [{ name: regex(input.vendor) }, { email: regex(input.vendor) }],
      }).distinct("_id");

      clauses.push({ vendor: { $in: vendorIds } });
    }
  }

  if (input.customer) {
    if (isObjectId(input.customer)) {
      clauses.push({ customer: new mongoose.Types.ObjectId(input.customer) });
    } else {
      const customerIds = await User.find({
        $or: [{ name: regex(input.customer) }, { email: regex(input.customer) }],
      }).distinct("_id");

      clauses.push({ customer: { $in: customerIds } });
    }
  }

  if (input.store) {
    if (isObjectId(input.store)) {
      clauses.push({ store: new mongoose.Types.ObjectId(input.store) });
    } else {
      const storeIds = await Store.find({ name: regex(input.store) }).distinct(
        "_id",
      );

      clauses.push({ store: { $in: storeIds } });
    }
  }

  if (!clauses.length) return null;

  const orders = await Order.find({
    $and: clauses,
  }).distinct("_id");

  return orders as mongoose.Types.ObjectId[];
}

async function buildShipmentFilter(
  query: ListShipmentsQuery,
): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [];

  if (query.status) and.push({ status: query.status });
  if (query.provider) and.push({ provider: regex(query.provider) });

  if (query.createdFrom || query.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (query.createdFrom) createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) {
      createdAt.$lte = endOfDayIfDateOnly(query.createdTo);
    }
    and.push({ createdAt });
  }

  const orderIds = await resolveOrderIds({
    order: query.order,
    vendor: query.vendor,
    customer: query.customer,
    store: query.store,
  });

  if (orderIds) {
    and.push({ order: { $in: orderIds } });
  }

  if (query.search) {
    const pattern = regex(query.search);
    const matchedOrders = await Order.find({
      $or: [
        { orderNumber: pattern },
        { masterOrderNumber: pattern },
        { subOrderNumber: pattern },
      ],
    }).distinct("_id");

    and.push({
      $or: [
        { trackingNumber: pattern },
        { providerOrderId: pattern },
        { order: { $in: matchedOrders } },
      ],
    });
  }

  return and.length ? { $and: and } : {};
}

function summaryFor(
  rows: Array<{ _id: string; count: number }>,
): Record<string, number> {
  const summary = SHIPMENT_STATUSES.reduce(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {} as Record<string, number>,
  );

  for (const row of rows) {
    if (row._id in summary) summary[row._id] = row.count;
  }

  return summary;
}

export interface ShipmentListResult {
  shipments: unknown[];
  summary: Record<string, number>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Server-side shipment directory. Shipments keep pointing at the vendor
 * sub-order; master-order context is included for dispatch staff.
 */
export async function queryShipments(
  query: ListShipmentsQuery,
): Promise<ShipmentListResult> {
  const filter = await buildShipmentFilter(query);
  const skip = (query.page - 1) * query.limit;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [shipments, total, summaryRows] = await Promise.all([
    Shipment.find(filter)
      .populate({
        path: "order",
        select:
          "orderNumber masterOrderNumber subOrderNumber customer vendor store status paymentStatus total shippingCity shippingState createdAt",
        populate: [...SHIPMENT_ORDER_POPULATE],
      })
      .sort({ [query.sortBy]: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Shipment.countDocuments(filter),
    Shipment.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    shipments,
    summary: summaryFor(summaryRows),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function findShipmentOrThrow(shipmentId: string) {
  const shipment = await Shipment.findById(shipmentId);

  if (!shipment) throw createError("Shipment not found", 404);

  return shipment;
}

async function loadPopulatedOrder(orderId: unknown) {
  const order = await Order.findById(orderId).populate([
    ...SHIPMENT_ORDER_POPULATE,
  ]);

  return order as OrderDocument | null;
}

/**
 * Full shipment record for operations staff: provider metadata, internal
 * status history and the owning sub-order with customer, vendor and store.
 */
export async function loadShipmentDetail(
  shipment: ShipmentDocument | Record<string, unknown>,
) {
  const record = shipment as unknown as Record<string, unknown>;
  const orderId = record.order;
  const order = await loadPopulatedOrder(orderId);

  const siblings = order
    ? await Shipment.find({
        order: { $in: await Order.find({
          $or: [
            ...(order.masterOrderNumber
              ? [{ masterOrderNumber: order.masterOrderNumber }]
              : []),
            { orderNumber: order.orderNumber },
          ],
        }).distinct("_id") },
        _id: { $ne: record._id },
      })
        .select(
          "trackingNumber status provider providerStatus courier deliveredAt lastEventAt",
        )
        .lean()
    : [];

  return {
    shipment: record,
    order,
    siblingShipments: siblings,
    // The raw provider payload is administrative troubleshooting data. It is
    // returned as stored and never contains the API key.
    provider: {
      name: record.provider ?? "shipbubble",
      orderId: record.providerOrderId ?? null,
      status: record.providerStatus ?? null,
      lastSyncedAt: record.lastSyncedAt ?? null,
      lastSyncAttemptAt: record.lastSyncAttemptAt ?? null,
      syncAttempts: record.syncAttempts ?? 0,
      error: record.providerError ?? null,
      response: record.providerResponse ?? null,
    },
  };
}

export async function loadShipmentDetailById(shipmentId: string) {
  const shipment = await findShipmentOrThrow(shipmentId);

  return loadShipmentDetail(shipment);
}

export interface ShipmentTrackingResult {
  events: unknown[];
  shipment: {
    id: string;
    trackingNumber: string;
    status: string;
    providerStatus: string | null;
    failureReason: string | null;
    estimatedDeliveryAt: Date | null;
    deliveredAt: Date | null;
    courier: unknown;
    lastEventAt: Date | null;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Tracking history comes from the deduplicated events embedded on the
 * shipment, newest first. Nothing is synthesised here: if a provider never
 * reported an event, it will not appear in the tracking timeline.
 */
export async function loadShipmentTracking(
  shipmentId: string,
  query: ShipmentTrackingQuery,
): Promise<ShipmentTrackingResult> {
  const shipment = await findShipmentOrThrow(shipmentId);

  const events = [...(shipment.events ?? [])].sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
  );

  const total = events.length;
  const skip = (query.page - 1) * query.limit;

  return {
    events: events.slice(skip, skip + query.limit),
    shipment: {
      id: String(shipment._id),
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      providerStatus: shipment.providerStatus ?? null,
      failureReason: shipment.failureReason ?? null,
      estimatedDeliveryAt: shipment.estimatedDeliveryAt ?? null,
      deliveredAt: shipment.deliveredAt ?? null,
      courier: shipment.courier ?? null,
      lastEventAt: shipment.lastEventAt ?? null,
    },
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}
