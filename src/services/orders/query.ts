import mongoose from "mongoose";
import Escrow from "@/models/escrow.model";
import Order, {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  type OrderDocument,
} from "@/models/order.model";
import Payment from "@/models/payment.model";
import Shipment, {
  SHIPMENT_STATUSES,
  type ShipmentDocument,
} from "@/models/shipment.model";
import User from "@/models/user.model";
import type {
  ListOrdersQuery,
  OrderShipmentsQuery,
  OrderSubOrdersQuery,
} from "@/schemas/order";
import {
  FULFILLMENT_STATUSES,
  deriveFulfillmentStatus,
  deriveMasterOrderStatus,
  deriveMasterPaymentStatus,
  type FulfillmentStatus,
} from "./status";
import {
  buildOrderTimeline,
  type TimelineOrderInput,
  type TimelinePaymentInput,
  type TimelineShipmentInput,
} from "./timeline";
import { createError } from "@/utils";

export const ORDER_GROUP_POPULATE = [
  { path: "customer", select: "name email username profilePicture phone status" },
  { path: "vendor", select: "name email username profilePicture status" },
  { path: "store", select: "name slug status category logo" },
] as const;

const isObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function endOfDayIfDateOnly(value: string) {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

function summaryFor<T extends string>(
  rows: Array<{ _id: string; count: number }>,
  keys: readonly T[],
): Record<T, number> {
  const summary = keys.reduce(
    (accumulator, key) => {
      accumulator[key] = 0;
      return accumulator;
    },
    {} as Record<T, number>,
  );

  for (const row of rows) {
    if (row._id in summary) summary[row._id as T] = row.count;
  }

  return summary;
}

export interface OrderListResult {
  orders: unknown[];
  summary: Record<string, number>;
  paymentSummary: Record<string, number>;
  fulfillmentSummary: Record<FulfillmentStatus, number>;
  shipmentSummary: Record<string, number>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Server-side order directory. Orders are vendor-specific fulfilment records;
 * `masterOrderNumber` groups the records produced by one checkout without
 * creating a second order collection.
 */
export async function queryOrders(
  query: ListOrdersQuery,
): Promise<OrderListResult> {
  const baseMatch: Record<string, unknown> = {};
  // Filters that depend on joined data run after the `$lookup` stages. Each
  // filter is an independent `$and` clause so combining a customer and a vendor
  // filter narrows the result instead of widening it.
  const postAnd: Record<string, unknown>[] = [];

  if (query.status) baseMatch.status = query.status;
  if (query.paymentStatus) baseMatch.paymentStatus = query.paymentStatus;

  if (query.customer) {
    if (isObjectId(query.customer)) {
      baseMatch.customer = new mongoose.Types.ObjectId(query.customer);
    } else {
      const pattern = new RegExp(escapeRegExp(query.customer), "i");
      postAnd.push({
        $or: [
          { "customerSummary.name": pattern },
          { "customerSummary.email": pattern },
        ],
      });
    }
  }

  if (query.vendor) {
    if (isObjectId(query.vendor)) {
      baseMatch.vendor = new mongoose.Types.ObjectId(query.vendor);
    } else {
      const pattern = new RegExp(escapeRegExp(query.vendor), "i");
      postAnd.push({
        $or: [
          { "vendorSummary.name": pattern },
          { "vendorSummary.email": pattern },
          { "storeSummary.name": pattern },
        ],
      });
    }
  }

  if (query.createdFrom || query.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (query.createdFrom) createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) {
      createdAt.$lte = endOfDayIfDateOnly(query.createdTo);
    }
    baseMatch.createdAt = createdAt;
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), "i");
    postAnd.push({
      $or: [
        { orderNumber: pattern },
        { masterOrderNumber: pattern },
        { subOrderNumber: pattern },
        { "customerSummary.name": pattern },
        { "customerSummary.email": pattern },
        { "vendorSummary.name": pattern },
        { "storeSummary.name": pattern },
      ],
    });
  }

  if (query.fulfillmentStatus) {
    postAnd.push({ fulfillmentStatus: query.fulfillmentStatus });
  }

  if (query.shipmentStatus) {
    postAnd.push({ shipmentStatuses: query.shipmentStatus });
  }

  const postMatch = postAnd.length ? { $and: postAnd } : {};

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const skip = (query.page - 1) * query.limit;

  const pipeline = [
    { $match: baseMatch },
    {
      $lookup: {
        from: "users",
        let: { customerId: "$customer" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$customerId"] } } },
          {
            $project: {
              name: 1,
              email: 1,
              username: 1,
              profilePicture: 1,
              phone: 1,
              status: 1,
            },
          },
        ],
        as: "customerSummary",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { vendorId: "$vendor" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$vendorId"] } } },
          {
            $project: {
              name: 1,
              email: 1,
              username: 1,
              profilePicture: 1,
              status: 1,
            },
          },
        ],
        as: "vendorSummary",
      },
    },
    {
      $lookup: {
        from: "stores",
        let: { storeId: "$store" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$storeId"] } } },
          {
            $project: { name: 1, slug: 1, status: 1, category: 1, logo: 1 },
          },
        ],
        as: "storeSummary",
      },
    },
    {
      $lookup: {
        from: "shipments",
        let: { orderId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$order", "$$orderId"] } } },
          { $sort: { createdAt: -1 } },
          {
            $project: {
              trackingNumber: 1,
              status: 1,
              provider: 1,
              providerStatus: 1,
              providerOrderId: 1,
              failureReason: 1,
              estimatedDeliveryAt: 1,
              deliveredAt: 1,
              lastEventAt: 1,
              createdAt: 1,
            },
          },
        ],
        as: "shipments",
      },
    },
    {
      $addFields: {
        customerSummary: { $arrayElemAt: ["$customerSummary", 0] },
        vendorSummary: { $arrayElemAt: ["$vendorSummary", 0] },
        storeSummary: { $arrayElemAt: ["$storeSummary", 0] },
        masterOrderNumber: { $ifNull: ["$masterOrderNumber", "$orderNumber"] },
        shipmentCount: { $size: "$shipments" },
        shipmentStatuses: "$shipments.status",
        latestShipment: { $arrayElemAt: ["$shipments", 0] },
        fulfillmentStatus: {
          $switch: {
            branches: [
              {
                case: { $in: ["$status", ["cancelled", "refunded"]] },
                then: "cancelled",
              },
              {
                case: {
                  $or: [
                    { $eq: ["$status", "delivered"] },
                    { $in: ["delivered", "$shipments.status"] },
                  ],
                },
                then: "delivered",
              },
              {
                case: { $in: ["failed", "$shipments.status"] },
                then: "failed",
              },
              {
                case: {
                  $or: [
                    { $eq: ["$status", "shipped"] },
                    {
                      $or: [
                        { $in: ["confirmed", "$shipments.status"] },
                        { $in: ["picked_up", "$shipments.status"] },
                        { $in: ["in_transit", "$shipments.status"] },
                      ],
                    },
                  ],
                },
                then: "shipped",
              },
              { case: { $eq: ["$status", "processing"] }, then: "processing" },
            ],
            default: "unfulfilled",
          },
        },
      },
    },
    { $match: postMatch },
    {
      $facet: {
        rows: [
          { $sort: { [query.sortBy]: sortDirection, _id: sortDirection } },
          { $skip: skip },
          { $limit: query.limit },
          { $project: { shipments: 0 } },
        ],
        total: [{ $count: "count" }],
        statusSummary: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        paymentSummary: [
          { $group: { _id: "$paymentStatus", count: { $sum: 1 } } },
        ],
        fulfillmentSummary: [
          { $group: { _id: "$fulfillmentStatus", count: { $sum: 1 } } },
        ],
        shipmentSummary: [
          { $unwind: "$shipmentStatuses" },
          { $group: { _id: "$shipmentStatuses", count: { $sum: 1 } } },
        ],
      },
    },
  ] as mongoose.PipelineStage[];

  const [result] = await Order.aggregate<{
    rows: unknown[];
    total: Array<{ count: number }>;
    statusSummary: Array<{ _id: string; count: number }>;
    paymentSummary: Array<{ _id: string; count: number }>;
    fulfillmentSummary: Array<{ _id: string; count: number }>;
    shipmentSummary: Array<{ _id: string; count: number }>;
  }>(pipeline);

  const total = result?.total[0]?.count ?? 0;

  return {
    orders: result?.rows ?? [],
    summary: summaryFor(result?.statusSummary ?? [], ORDER_STATUSES),
    paymentSummary: summaryFor(
      result?.paymentSummary ?? [],
      ORDER_PAYMENT_STATUSES,
    ),
    fulfillmentSummary: summaryFor(
      result?.fulfillmentSummary ?? [],
      FULFILLMENT_STATUSES,
    ),
    shipmentSummary: summaryFor(
      result?.shipmentSummary ?? [],
      SHIPMENT_STATUSES,
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export function orderGroupKey(order: {
  masterOrderNumber?: string | null;
  orderNumber: string;
}) {
  return order.masterOrderNumber || order.orderNumber;
}

/** The master is the order whose number is the group key, plus all sub-orders. */
export function orderGroupFilter(key: string) {
  return {
    $or: [{ masterOrderNumber: key }, { orderNumber: key }],
  };
}

export async function findOrderOrThrow(orderId: string) {
  const order = await Order.findById(orderId);

  if (!order) throw createError("Order not found", 404);

  return order;
}

export async function loadOrderGroup(selected: OrderDocument) {
  const key = orderGroupKey(selected);
  const orders = await Order.find({
    $or: [
      ...(orderGroupFilter(key).$or ?? []),
      { _id: selected._id },
    ],
  })
    .populate([...ORDER_GROUP_POPULATE])
    .sort({ createdAt: 1, _id: 1 });

  return orders.length ? orders : [selected];
}

export async function orderIdsForGroup(selected: OrderDocument) {
  const orders = await loadOrderGroup(selected);

  return orders.map((order) => order._id);
}

export function groupSummary(orders: OrderDocument[]) {
  const total = (field: "subtotal" | "shippingFee" | "discount" | "total") =>
    orders.reduce((sum, order) => sum + Number(order[field] ?? 0), 0);

  const statusCounts = orders.reduce<Record<string, number>>(
    (accumulator, order) => {
      accumulator[order.status] = (accumulator[order.status] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  const paymentStatusCounts = orders.reduce<Record<string, number>>(
    (accumulator, order) => {
      accumulator[order.paymentStatus] =
        (accumulator[order.paymentStatus] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  const createdAt = orders.reduce<Date | null>((earliest, order) => {
    const date = order.createdAt ? new Date(order.createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) return earliest;
    if (!earliest) return date;

    return date < earliest ? date : earliest;
  }, null);

  const first = orders[0];

  return {
    masterOrderNumber: first ? orderGroupKey(first) : null,
    orderCount: orders.length,
    status: deriveMasterOrderStatus(orders.map((order) => order.status)),
    paymentStatus: deriveMasterPaymentStatus(
      orders.map((order) => order.paymentStatus),
    ),
    subtotal: total("subtotal"),
    shippingFee: total("shippingFee"),
    discount: total("discount"),
    total: total("total"),
    createdAt: createdAt?.toISOString() ?? null,
    customer: first?.customer ?? null,
    shippingAddress:
      first?.shippingAddress ??
      (first
        ? {
            recipientName: null,
            phone: null,
            street: null,
            city: first.shippingCity ?? null,
            lga: null,
            state: first.shippingState ?? null,
            country: "Nigeria",
            landmark: null,
          }
        : null),
    statusCounts,
    paymentStatusCounts,
  };
}

export interface OrderGroupContext {
  selectedOrder: OrderDocument;
  masterOrderNumber: string;
  orders: OrderDocument[];
  shipments: ShipmentDocument[];
  payments: Array<Record<string, unknown>>;
  escrows: Array<Record<string, unknown>>;
  summary: ReturnType<typeof groupSummary>;
}

export async function loadOrderGroupContext(
  selected: OrderDocument,
): Promise<OrderGroupContext> {
  const orders = await loadOrderGroup(selected);
  const orderIds = orders.map((order) => order._id);

  const [shipments, payments, escrows] = await Promise.all([
    Shipment.find({ order: { $in: orderIds } })
      .populate({
        path: "order",
        select:
          "orderNumber masterOrderNumber subOrderNumber vendor store status paymentStatus total",
      })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    Payment.find({ order: { $in: orderIds } })
      .sort({ createdAt: -1, _id: -1 })
      .lean(),
    Escrow.find({ order: { $in: orderIds } })
      .sort({ createdAt: -1, _id: -1 })
      .lean(),
  ]);

  return {
    selectedOrder: orders.find((order) => String(order._id) === String(selected._id)) ?? selected,
    masterOrderNumber: orderGroupKey(orders[0] ?? selected),
    orders,
    shipments: shipments as unknown as ShipmentDocument[],
    payments: payments as unknown as Array<Record<string, unknown>>,
    escrows: escrows as unknown as Array<Record<string, unknown>>,
    summary: groupSummary(orders),
  };
}

function plainOrder(order: OrderDocument): TimelineOrderInput {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    subOrderNumber: order.subOrderNumber ?? null,
    masterOrderNumber: orderGroupKey(order),
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

function plainPayment(payment: Record<string, unknown>): TimelinePaymentInput {
  return {
    orderId: String(payment.order),
    status: payment.status as string,
    reference: payment.reference as string,
    paidAt: payment.paidAt as Date | null,
    createdAt: payment.createdAt as Date | null,
  };
}

function plainShipment(shipment: ShipmentDocument): TimelineShipmentInput {
  const doc = shipment as unknown as Record<string, unknown>;

  return {
    id: String(doc._id),
    orderId: String(doc.order),
    trackingNumber: doc.trackingNumber as string,
    status: String(doc.status),
    createdAt: doc.createdAt as Date | undefined,
    updatedAt: doc.updatedAt as Date | undefined,
    deliveredAt: doc.deliveredAt as Date | undefined,
    lastEventAt: doc.lastEventAt as Date | undefined,
    events: (
      (doc.events as Array<Record<string, unknown>> | undefined) ?? []
    ).map((event) => ({
      status: event.status as string | null,
      message: event.message as string | null,
      occurredAt: event.occurredAt as Date,
    })),
  };
}

export function orderTimelineForContext(context: OrderGroupContext) {
  return buildOrderTimeline({
    orders: context.orders.map(plainOrder),
    payments: context.payments.map(plainPayment),
    shipments: context.shipments.map(plainShipment),
  });
}

export function attachShipmentsToOrders(
  orders: OrderDocument[],
  shipments: ShipmentDocument[],
  payments: Array<Record<string, unknown>> = [],
  escrows: Array<Record<string, unknown>> = [],
) {
  return orders.map((order) => {
    const plain = order.toObject() as Record<string, unknown>;
    const orderId = String(order._id);

    return {
      ...plain,
      fulfillmentStatus: deriveFulfillmentStatus(
        order.status,
        shipments
          .filter((shipment) => String(shipment.order) === orderId)
          .map((shipment) => shipment.status),
      ),
      shipments: shipments.filter(
        (shipment) => String(shipment.order) === orderId,
      ),
      payment:
        payments.find(
          (payment) => String(payment.order) === orderId,
        ) ?? null,
      escrow:
        escrows.find((escrow) => String(escrow.order) === orderId) ?? null,
    };
  });
}

export interface SubOrderListResult {
  subOrders: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export async function querySubOrders(
  selected: OrderDocument,
  query: OrderSubOrdersQuery,
): Promise<SubOrderListResult> {
  const key = orderGroupKey(selected);
  const filter: Record<string, unknown> = {
    $and: [
      {
        $or: [
          ...(orderGroupFilter(key).$or ?? []),
          { _id: selected._id },
        ],
      },
    ],
  };

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  if (query.vendor) {
    if (isObjectId(query.vendor)) {
      filter.vendor = new mongoose.Types.ObjectId(query.vendor);
    } else {
      const pattern = new RegExp(escapeRegExp(query.vendor), "i");
      const vendorIds = await User.find({ name: pattern }).distinct("_id");
      filter.vendor = { $in: vendorIds };
    }
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), "i");
    (filter.$and as unknown[]).push({
      $or: [
        { orderNumber: pattern },
        { subOrderNumber: pattern },
        { masterOrderNumber: pattern },
      ],
    });
  }

  const skip = (query.page - 1) * query.limit;
  const baseQuery = Order.find(filter);

  const [subOrders, total] = await Promise.all([
    baseQuery
      .clone()
      .populate([...ORDER_GROUP_POPULATE])
      .sort({ createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    Order.countDocuments(baseQuery.getFilter()),
  ]);

  return {
    subOrders,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export interface OrderShipmentListResult {
  shipments: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export async function queryOrderShipments(
  selected: OrderDocument,
  query: OrderShipmentsQuery,
): Promise<OrderShipmentListResult> {
  const orderIds = await orderIdsForGroup(selected);
  const filter: Record<string, unknown> = { order: { $in: orderIds } };

  if (query.status) filter.status = query.status;
  if (query.provider) filter.provider = query.provider;

  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), "i");
    filter.$or = [
      { trackingNumber: pattern },
      { providerOrderId: pattern },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const baseQuery = Shipment.find(filter);

  const [shipments, total] = await Promise.all([
    baseQuery
      .clone()
      .populate({
        path: "order",
        select:
          "orderNumber masterOrderNumber subOrderNumber vendor store status paymentStatus total",
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Shipment.countDocuments(baseQuery.getFilter()),
  ]);

  return {
    shipments,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}
