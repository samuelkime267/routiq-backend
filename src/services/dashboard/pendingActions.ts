import Dispute, {
  UNRESOLVED_DISPUTE_STATUSES,
} from "@/models/dispute.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Product from "@/models/product.model";
import Shipment from "@/models/shipment.model";
import Store from "@/models/store.model";
import type { DashboardPendingAction } from "./types";

interface QueueRow {
  count: number;
  oldest: Date | null;
}

interface QueueDefinition {
  key: DashboardPendingAction["key"];
  label: string;
  description: string;
  href: string;
  severity: DashboardPendingAction["severity"];
}

const QUEUE_DEFINITIONS: QueueDefinition[] = [
  {
    key: "store_approvals",
    label: "Pending store approvals",
    description: "Store submissions waiting for verification.",
    href: "/stores?status=pending",
    severity: "high",
  },
  {
    key: "product_moderation",
    label: "Pending product moderation",
    description: "Listings waiting for catalogue review.",
    href: "/products?status=pending",
    severity: "medium",
  },
  {
    key: "delayed_orders",
    label: "Delayed orders",
    description: "Orders past their expected delivery date.",
    href: "/orders?status=delayed",
    severity: "high",
  },
  {
    key: "failed_shipments",
    label: "Failed shipments",
    description: "Deliveries the provider could not complete.",
    href: "/logistics?status=failed",
    severity: "high",
  },
  {
    key: "unresolved_disputes",
    label: "Unresolved disputes",
    description: "Cases that are open or under investigation.",
    href: "/disputes?status=open",
    severity: "high",
  },
  {
    key: "payment_issues",
    label: "Payment issues",
    description: "Failed payments that may need a retry.",
    href: "/payments?status=failed",
    severity: "medium",
  },
];

const firstQueue = (rows: QueueRow[]) => ({
  count: rows[0]?.count ?? 0,
  oldest:
    rows[0]?.oldest instanceof Date ? rows[0].oldest.toISOString() : null,
});

/**
 * Counts and the oldest item for every operational queue.
 *
 * One aggregation per queue keeps this constant-cost: six queries regardless of
 * how many records exist. Queues with zero items are still returned so the UI
 * can show an explicit "all clear" state.
 */
export async function getPendingActions(
  now: Date = new Date(),
): Promise<DashboardPendingAction[]> {
  const [stores, products, delayedOrders, failedShipments, disputes, payments] =
    await Promise.all([
      Store.aggregate<QueueRow>([
        { $match: { status: "pending" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            oldest: { $min: "$submittedAt" },
          },
        },
      ]),
      Product.aggregate<QueueRow>([
        { $match: { status: "pending" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            oldest: { $min: "$createdAt" },
          },
        },
      ]),
      Order.aggregate<QueueRow>([
        {
          $match: {
            status: { $in: ["confirmed", "processing", "shipped"] },
            expectedDeliveryAt: { $ne: null, $lt: now },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            oldest: { $min: "$expectedDeliveryAt" },
          },
        },
      ]),
      Shipment.aggregate<QueueRow>([
        { $match: { status: "failed" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            oldest: { $min: "$lastEventAt" },
          },
        },
      ]),
      Dispute.aggregate<QueueRow>([
        { $match: { status: { $in: [...UNRESOLVED_DISPUTE_STATUSES] } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            oldest: { $min: "$createdAt" },
          },
        },
      ]),
      Payment.aggregate<QueueRow>([
        { $match: { status: "failed" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            oldest: { $min: "$createdAt" },
          },
        },
      ]),
    ]);

  const queues = {
    store_approvals: firstQueue(stores),
    product_moderation: firstQueue(products),
    delayed_orders: firstQueue(delayedOrders),
    failed_shipments: firstQueue(failedShipments),
    unresolved_disputes: firstQueue(disputes),
    payment_issues: firstQueue(payments),
  };

  return QUEUE_DEFINITIONS.map((definition) => ({
    ...definition,
    count: queues[definition.key].count,
    oldestAt: queues[definition.key].oldest,
  }));
}
