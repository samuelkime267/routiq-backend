import { GMV_ORDER_STATUSES } from "@/models/order.model";
import { UNRESOLVED_DISPUTE_STATUSES } from "@/models/dispute.model";
import Dispute from "@/models/dispute.model";
import Escrow from "@/models/escrow.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Product from "@/models/product.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import { percentageChange, previousRange, type DashboardRange } from "./range";
import type {
  DashboardMetric,
  DashboardMetricKey,
  DashboardMetricBasis,
  DashboardValueFormat,
} from "./types";

interface MetricDefinition {
  label: string;
  description: string;
  basis: DashboardMetricBasis;
  format: DashboardValueFormat;
}

/**
 * Every card on the dashboard is defined here with the exact rule used to
 * compute it. Keeping the definition next to the query prevents GMV, revenue
 * and escrow balances from being confused with one another.
 */
const METRIC_DEFINITIONS: Record<DashboardMetricKey, MetricDefinition> = {
  totalUsers: {
    label: "Total customers",
    description: "Customer accounts on the marketplace (role: user).",
    basis: "all_time",
    format: "number",
  },
  totalVendors: {
    label: "Total vendors",
    description: "Vendor accounts in every account status.",
    basis: "all_time",
    format: "number",
  },
  activeVendors: {
    label: "Active vendors",
    description:
      "Active vendor accounts that own at least one approved store.",
    basis: "all_time",
    format: "number",
  },
  totalStores: {
    label: "Total stores",
    description: "Stores across every lifecycle status.",
    basis: "all_time",
    format: "number",
  },
  pendingStoreApprovals: {
    label: "Pending store approvals",
    description: "Store submissions waiting for an administrative review.",
    basis: "all_time",
    format: "number",
  },
  totalProducts: {
    label: "Total products",
    description: "Listings across every moderation status.",
    basis: "all_time",
    format: "number",
  },
  pendingProductApprovals: {
    label: "Pending product approvals",
    description: "Listings waiting for catalogue moderation.",
    basis: "all_time",
    format: "number",
  },
  totalOrders: {
    label: "Total orders",
    description: "Orders placed since launch, in every order status.",
    basis: "all_time",
    format: "number",
  },
  grossMerchandiseValue: {
    label: "Gross merchandise value",
    description:
      "Value of orders placed in the selected period, excluding cancelled and refunded orders. This is not platform revenue.",
    basis: "range",
    format: "currency",
  },
  marketplaceRevenue: {
    label: "Marketplace revenue",
    description:
      "Commission earned on successful payments in the selected period. Excludes vendor payouts and money held in escrow.",
    basis: "range",
    format: "currency",
  },
  escrowBalance: {
    label: "Held in escrow",
    description:
      "Successful payments not yet released to vendors or refunded. Escrow is a liability, not revenue.",
    basis: "all_time",
    format: "currency",
  },
  unresolvedDisputes: {
    label: "Unresolved disputes",
    description: "Disputes that are open or under investigation.",
    basis: "all_time",
    format: "number",
  },
};

function metric(
  key: DashboardMetricKey,
  value: number,
  comparison?: { previousValue: number; changePct: number | null },
): DashboardMetric {
  const definition = METRIC_DEFINITIONS[key];

  return {
    key,
    label: definition.label,
    description: definition.description,
    basis: definition.basis,
    format: definition.format,
    value,
    ...(comparison ?? {}),
  };
}

interface CountBucket {
  value: number;
}

type RangeSumFacet = {
  current: CountBucket[];
  previous: CountBucket[];
};

const firstValue = (rows: CountBucket[] | undefined) =>
  rows?.[0]?.value ?? 0;

/**
 * Current marketplace metrics.
 *
 * Counts are current-state totals; money metrics respect the selected range
 * (with a previous-period comparison) so the date filter has a clear meaning.
 */
export async function getDashboardMetrics(
  range: DashboardRange,
): Promise<DashboardMetric[]> {
  const previous = previousRange(range);

  const [
    userCounts,
    activeVendors,
    storeCounts,
    productCounts,
    totalOrders,
    orderValue,
    paymentRevenue,
    escrowBalance,
    unresolvedDisputes,
  ] = await Promise.all([
    User.aggregate<{
      customers: CountBucket[];
      vendors: CountBucket[];
    }>([
      {
        $facet: {
          customers: [{ $match: { role: "user" } }, { $count: "value" }],
          vendors: [{ $match: { role: "vendor" } }, { $count: "value" }],
        },
      },
    ]),
    Store.aggregate<CountBucket>([
      { $match: { status: "approved" } },
      { $group: { _id: "$owner" } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "owner",
        },
      },
      { $unwind: "$owner" },
      { $match: { "owner.role": "vendor", "owner.status": "active" } },
      { $count: "value" },
    ]),
    Store.aggregate<{ total: CountBucket[]; pending: CountBucket[] }>([
      {
        $facet: {
          total: [{ $count: "value" }],
          pending: [{ $match: { status: "pending" } }, { $count: "value" }],
        },
      },
    ]),
    Product.aggregate<{ total: CountBucket[]; pending: CountBucket[] }>([
      {
        $facet: {
          total: [{ $count: "value" }],
          pending: [{ $match: { status: "pending" } }, { $count: "value" }],
        },
      },
    ]),
    Order.countDocuments({}),
    Order.aggregate<RangeSumFacet>([
      {
        $match: {
          status: { $in: [...GMV_ORDER_STATUSES] },
          createdAt: { $gte: previous.start, $lt: range.end },
        },
      },
      {
        $facet: {
          current: [
            { $match: { createdAt: { $gte: range.start } } },
            { $group: { _id: null, value: { $sum: "$total" } } },
          ],
          previous: [
            { $match: { createdAt: { $lt: range.start } } },
            { $group: { _id: null, value: { $sum: "$total" } } },
          ],
        },
      },
    ]),
    Payment.aggregate<RangeSumFacet>([
      {
        $match: {
          status: "successful",
          paidAt: { $gte: previous.start, $lt: range.end },
        },
      },
      {
        $facet: {
          current: [
            { $match: { paidAt: { $gte: range.start } } },
            { $group: { _id: null, value: { $sum: "$platformFee" } } },
          ],
          previous: [
            { $match: { paidAt: { $lt: range.start } } },
            { $group: { _id: null, value: { $sum: "$platformFee" } } },
          ],
        },
      },
    ]),
    Escrow.aggregate<CountBucket>([
      { $match: { status: "held" } },
      {
        $group: {
          _id: null,
          value: {
            $sum: {
              $subtract: [
                "$amountHeld",
                { $add: ["$amountReleased", "$amountRefunded"] },
              ],
            },
          },
        },
      },
    ]),
    Dispute.countDocuments({
      status: { $in: [...UNRESOLVED_DISPUTE_STATUSES] },
    }),
  ]);

  const gmvCurrent = firstValue(orderValue[0]?.current);
  const gmvPrevious = firstValue(orderValue[0]?.previous);
  const revenueCurrent = firstValue(paymentRevenue[0]?.current);
  const revenuePrevious = firstValue(paymentRevenue[0]?.previous);

  return [
    metric("totalUsers", firstValue(userCounts[0]?.customers)),
    metric("totalVendors", firstValue(userCounts[0]?.vendors)),
    metric("activeVendors", firstValue(activeVendors)),
    metric("totalStores", firstValue(storeCounts[0]?.total)),
    metric(
      "pendingStoreApprovals",
      firstValue(storeCounts[0]?.pending),
    ),
    metric("totalProducts", firstValue(productCounts[0]?.total)),
    metric(
      "pendingProductApprovals",
      firstValue(productCounts[0]?.pending),
    ),
    metric("totalOrders", totalOrders),
    metric("grossMerchandiseValue", gmvCurrent, {
      previousValue: gmvPrevious,
      changePct: percentageChange(gmvCurrent, gmvPrevious),
    }),
    metric("marketplaceRevenue", revenueCurrent, {
      previousValue: revenuePrevious,
      changePct: percentageChange(revenueCurrent, revenuePrevious),
    }),
    metric("escrowBalance", firstValue(escrowBalance)),
    metric("unresolvedDisputes", unresolvedDisputes),
  ];
}
