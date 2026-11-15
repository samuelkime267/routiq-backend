import mongoose from "mongoose";
import Order, { type OrderDocument } from "@/models/order.model";
import Payment from "@/models/payment.model";
import Shipment from "@/models/shipment.model";
import Store from "@/models/store.model";
import { createError } from "@/utils";
import {
  deriveMasterOrderStatus,
  deriveMasterPaymentStatus,
} from "./status";
import {
  groupSummary,
  loadOrderGroupContext,
  orderGroupKey,
  orderTimelineForContext,
} from "./query";

export interface CustomerOrderListQuery {
  page: number;
  limit: number;
  status?: string;
}

interface GroupRow {
  _id: string;
  orders: Array<{
    _id: string;
    orderNumber: string;
    store: unknown;
    status: string;
    paymentStatus: string;
    total: number;
    subtotal: number;
    shippingFee: number;
    placedAt: Date | null;
    expectedDeliveryAt: Date | null;
    itemCount: number;
  }>;
  orderCount: number;
  itemCount: number;
  total: number;
  subtotal: number;
  deliveryFee: number;
  placedAt: Date | null;
  statuses: string[];
  paymentStatuses: string[];
}

function storeSummary(row: Record<string, any> | undefined) {
  if (!row) return null;

  return {
    _id: String(row._id),
    name: row.name ?? "",
    slug: row.slug ?? "",
    logo: row.logo ?? null,
    category: row.category ?? "",
  };
}

export async function queryCustomerOrders(
  customerId: string,
  query: CustomerOrderListQuery,
) {
  const now = new Date();
  const skip = (query.page - 1) * query.limit;

  const [result] = await Order.aggregate<{
    rows: GroupRow[];
    total: Array<{ count: number }>;
  }>([
    {
      $match: {
        customer: new mongoose.Types.ObjectId(String(customerId)),
      },
    },
    {
      $addFields: {
        groupKey: { $ifNull: ["$masterOrderNumber", "$orderNumber"] },
      },
    },
    ...(query.status
      ? [{ $match: { status: query.status } }]
      : []),
    { $sort: { placedAt: -1, createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$groupKey",
        orders: {
          $push: {
            _id: "$_id",
            orderNumber: "$orderNumber",
            store: "$store",
            status: "$status",
            paymentStatus: "$paymentStatus",
            total: "$total",
            subtotal: "$subtotal",
            shippingFee: "$shippingFee",
            placedAt: "$placedAt",
            expectedDeliveryAt: "$expectedDeliveryAt",
            itemCount: { $sum: "$items.quantity" },
          },
        },
        orderCount: { $sum: 1 },
        itemCount: { $sum: { $sum: "$items.quantity" } },
        total: { $sum: "$total" },
        subtotal: { $sum: "$subtotal" },
        deliveryFee: { $sum: "$shippingFee" },
        placedAt: { $max: "$placedAt" },
        statuses: { $addToSet: "$status" },
        paymentStatuses: { $addToSet: "$paymentStatus" },
      },
    },
    { $sort: { placedAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: query.limit }],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const rows = result?.rows ?? [];
  const storeIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.orders.map((order) => String(order.store)),
      ),
    ),
  ];
  const stores = await Store.find({ _id: { $in: storeIds } }).select(
    "name slug logo category",
  );
  const storeMap = new Map(
    stores.map((store) => [String(store._id), store.toObject()]),
  );

  const total = result?.total[0]?.count ?? 0;

  return {
    orders: rows.map((row) => ({
      masterOrderNumber: row._id,
      orderCount: row.orderCount,
      itemCount: row.itemCount,
      status: deriveMasterOrderStatus(row.statuses),
      paymentStatus: deriveMasterPaymentStatus(row.paymentStatuses),
      subtotal: row.subtotal,
      deliveryFee: row.deliveryFee,
      discount: Math.max(0, row.subtotal + row.deliveryFee - row.total),
      total: row.total,
      placedAt: row.placedAt ?? null,
      expectedDeliveryAt:
        row.orders
          .map((order) => order.expectedDeliveryAt)
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => left.getTime() - right.getTime())[0] ?? null,
      orders: row.orders.map((order) => ({
        _id: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        itemCount: order.itemCount,
        store: storeSummary(storeMap.get(String(order.store))),
      })),
      isPendingPayment: row.paymentStatuses.some(
        (status) => status === "pending",
      ),
      createdAt: row.placedAt
        ? new Date(row.placedAt).toISOString()
        : null,
      retrievedAt: now.toISOString(),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

function safePayment(row: Record<string, any>) {
  return {
    _id: String(row._id),
    reference: row.reference,
    amount: row.amount,
    currency: row.currency ?? "NGN",
    status: row.status,
    channel: row.channel ?? null,
    provider: row.provider ?? null,
    paidAt: row.paidAt ?? null,
    failureReason: row.failureReason ?? null,
    createdAt: row.createdAt ?? null,
  };
}

function safeShipment(row: Record<string, any>) {
  return {
    _id: String(row._id),
    trackingNumber: row.trackingNumber,
    provider: row.provider ?? null,
    status: row.status,
    providerStatus: row.providerStatus ?? null,
    trackingUrl: row.trackingUrl ?? null,
    courier: row.courier ?? null,
    failureReason: row.failureReason ?? null,
    estimatedDeliveryAt: row.estimatedDeliveryAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    lastEventAt: row.lastEventAt ?? null,
    events: (row.events ?? []).map((event: Record<string, any>) => ({
      status: event.status ?? null,
      message: event.message ?? null,
      location: event.location ?? null,
      occurredAt: event.occurredAt ?? null,
    })),
    createdAt: row.createdAt ?? null,
  };
}

/**
 * Loads one master order group for its owner. Vendor/customer account details,
 * payment provider credentials and internal escrow records are deliberately not
 * part of the customer contract.
 */
export async function getCustomerOrderGroup(
  customerId: string,
  reference: string,
) {
  const selected = await Order.findOne({
    customer: customerId,
    $or: [{ masterOrderNumber: reference }, { orderNumber: reference }],
  });

  if (!selected) {
    throw createError("Order not found", 404);
  }

  const key = orderGroupKey(selected);
  const orders = await Order.find({
    customer: customerId,
    $or: [{ masterOrderNumber: key }, { orderNumber: key }],
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const orderIds = orders.map((order) => order._id);
  const storeIds = [...new Set(orders.map((order) => String(order.store)))];

  const [payments, shipments, stores] = await Promise.all([
    Payment.find({ order: { $in: orderIds } })
      .sort({ createdAt: 1 })
      .lean(),
    Shipment.find({ order: { $in: orderIds } })
      .sort({ createdAt: 1 })
      .lean(),
    Store.find({ _id: { $in: storeIds } })
      .select("name slug logo category")
      .lean(),
  ]);

  const storeMap = new Map(
    stores.map((store) => [String(store._id), store as Record<string, any>]),
  );

  const context = await loadOrderGroupContext(selected);

  return {
    masterOrderNumber: key,
    orders: orders.map((order) => {
      const store = storeMap.get(String(order.store)) ?? null;

      return {
        _id: String(order._id),
        orderNumber: order.orderNumber,
        subOrderNumber: order.subOrderNumber ?? null,
        masterOrderNumber: key,
        store: store
          ? {
              _id: String(store._id),
              name: store.name ?? "",
              slug: store.slug ?? "",
              logo: store.logo ?? null,
              category: store.category ?? "",
            }
          : null,
        items: (order.items ?? []).map((item) => ({
          product: String(item.product),
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        discount: order.discount,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        shippingAddress: order.shippingAddress ?? null,
        timeline: (order.timeline ?? []).map((event) => ({
          type: event.type,
          occurredAt: event.occurredAt,
          description: event.description ?? null,
        })),
        placedAt: order.placedAt ?? null,
        expectedDeliveryAt: order.expectedDeliveryAt ?? null,
        deliveredAt: order.deliveredAt ?? null,
        cancelledAt: order.cancelledAt ?? null,
        createdAt: (order as unknown as { createdAt?: Date }).createdAt ?? null,
      };
    }),
    payments: payments.map(safePayment),
    shipments: shipments.map(safeShipment),
    summary: groupSummary(context.orders as OrderDocument[]),
    timeline: orderTimelineForContext(context),
  };
}
