import mongoose from "mongoose";
import Escrow from "@/models/escrow.model";
import Order, { GMV_ORDER_STATUSES } from "@/models/order.model";
import Payment from "@/models/payment.model";
import Product from "@/models/product.model";
import Withdrawal, {
  OPEN_WITHDRAWAL_STATUSES,
} from "@/models/withdrawal.model";
import {
  bucketFormat,
  bucketKey,
  bucketLabel,
  percentageChange,
  previousRange,
  rangeBuckets,
  resolveDashboardRange,
  toRangeDTO,
  type DashboardRange,
  type DashboardRangeInput,
} from "@/services/dashboard";
import type { DashboardPoint } from "@/services/dashboard/types";

export interface VendorLedgerTotals {
  grossSales: number;
  platformFees: number;
  netEarnings: number;
  refunds: number;
  refundedEarnings: number;
  pendingEarnings: number;
  settledEarnings: number;
  withdrawn: number;
  withdrawalPending: number;
  availableBalance: number;
  /**
   * Manual ledger corrections are not implemented yet, so this is always zero.
   * It is returned explicitly rather than hidden so the reconciliation equation
   * is visible in the UI.
   */
  adjustments: number;
  successfulPayments: number;
  refundedPayments: number;
  heldEscrows: number;
}

const emptyTotals = (): VendorLedgerTotals => ({
  grossSales: 0,
  platformFees: 0,
  netEarnings: 0,
  refunds: 0,
  refundedEarnings: 0,
  pendingEarnings: 0,
  settledEarnings: 0,
  withdrawn: 0,
  withdrawalPending: 0,
  availableBalance: 0,
  adjustments: 0,
  successfulPayments: 0,
  refundedPayments: 0,
  heldEscrows: 0,
});

const first = (value: number | undefined) => value ?? 0;

interface PaymentRow {
  _id: null;
  amount: number;
  fee: number;
  vendorAmount: number;
  count: number;
}

interface EscrowRow {
  _id: null;
  held: number;
  released: number;
  heldCount: number;
}

interface WithdrawalRow {
  _id: string;
  value: number;
  count: number;
}

function objectId(value: string) {
  return new mongoose.Types.ObjectId(value);
}

async function paymentTotals(vendorId: string) {
  const rows = await Payment.aggregate<{
    successful?: PaymentRow[];
    refunded?: PaymentRow[];
  }>([
    { $match: { vendor: objectId(vendorId) } },
    {
      $facet: {
        successful: [
          { $match: { status: "successful" } },
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount" },
              fee: { $sum: "$platformFee" },
              vendorAmount: { $sum: "$vendorAmount" },
              count: { $sum: 1 },
            },
          },
        ],
        refunded: [
          { $match: { status: "refunded" } },
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount" },
              fee: { $sum: "$platformFee" },
              vendorAmount: { $sum: "$vendorAmount" },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const successful = rows[0]?.successful?.[0];
  const refunded = rows[0]?.refunded?.[0];

  return {
    grossSales: first(successful?.amount),
    platformFees: first(successful?.fee),
    netEarnings: first(successful?.vendorAmount),
    refunds: first(refunded?.amount),
    refundedEarnings: first(refunded?.vendorAmount),
    successfulPayments: first(successful?.count),
    refundedPayments: first(refunded?.count),
  };
}

async function escrowTotals(vendorId: string) {
  const rows = await Escrow.aggregate<EscrowRow>([
    { $match: { vendor: objectId(vendorId) } },
    {
      $group: {
        _id: null,
        held: {
          $sum: {
            $cond: [
              { $eq: ["$status", "held"] },
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      "$amountHeld",
                      { $add: ["$amountReleased", "$amountRefunded"] },
                    ],
                  },
                ],
              },
              0,
            ],
          },
        },
        released: {
          $sum: {
            $cond: [{ $eq: ["$status", "released"] }, "$amountReleased", 0],
          },
        },
        heldCount: {
          $sum: { $cond: [{ $eq: ["$status", "held"] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    held: Math.max(0, first(rows[0]?.held)),
    released: Math.max(0, first(rows[0]?.released)),
    heldCount: first(rows[0]?.heldCount),
  };
}

async function withdrawalTotals(vendorId: string) {
  const rows = await Withdrawal.aggregate<WithdrawalRow>([
    { $match: { vendor: objectId(vendorId) } },
    { $group: { _id: "$status", value: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  let paid = 0;
  let open = 0;

  for (const row of rows) {
    if (row._id === "paid") paid += row.value;
    if ((OPEN_WITHDRAWAL_STATUSES as readonly string[]).includes(row._id)) {
      open += row.value;
    }
  }

  return { paid, open, rows };
}

/**
 * Ledger-derived vendor balance. This is the only place vendor money is
 * calculated, so the dashboard, finance summary and withdrawal validation can
 * never disagree with each other.
 */
export async function computeVendorLedger(
  vendorId: string,
): Promise<VendorLedgerTotals> {
  const [payments, escrows, withdrawals] = await Promise.all([
    paymentTotals(vendorId),
    escrowTotals(vendorId),
    withdrawalTotals(vendorId),
  ]);

  const netEarnings = Math.max(
    0,
    payments.netEarnings - payments.refundedEarnings,
  );
  const availableBalance = Math.max(
    0,
    escrows.released - withdrawals.paid - withdrawals.open,
  );

  return {
    ...emptyTotals(),
    ...payments,
    netEarnings,
    pendingEarnings: escrows.held,
    settledEarnings: escrows.released,
    withdrawn: withdrawals.paid,
    withdrawalPending: withdrawals.open,
    availableBalance,
    heldEscrows: escrows.heldCount,
  };
}

export function ledgerDefinitions() {
  return {
    grossSales:
      "Value of successful customer payments for your store, before refunds.",
    platformFees:
      "Routiq commission recognised on successful payments. It is stored when the payment is created and never recalculated.",
    netEarnings:
      "Your share of successful payments (gross sales minus platform commission and refunded earnings).",
    refunds: "Value of payments that were refunded to customers.",
    pendingEarnings:
      "Escrow money still held for orders that are not yet settled. It is not withdrawable.",
    settledEarnings:
      "Escrow that has been released to you. This is the money withdrawals are paid from.",
    withdrawn: "Withdrawal requests that have been confirmed as paid.",
    withdrawalPending:
      "Withdrawals awaiting review or payout. These amounts are reserved and cannot be requested twice.",
    availableBalance:
      "Settled earnings minus paid and reserved withdrawals. Every withdrawal is validated against this figure on the server.",
    adjustments:
      "Manual ledger corrections. None are recorded yet, so this is zero.",
  } as const;
}

export interface VendorFinanceSummary {
  totals: VendorLedgerTotals;
  definitions: ReturnType<typeof ledgerDefinitions>;
  reconciliation: {
    equation: string;
    ledgerAvailable: number;
    recomputedAvailable: number;
    matches: boolean;
  };
  generatedAt: string;
}

export async function getVendorFinanceSummary(
  vendorId: string,
): Promise<VendorFinanceSummary> {
  const totals = await computeVendorLedger(vendorId);
  const recomputedAvailable = Math.max(
    0,
    totals.settledEarnings +
      totals.adjustments -
      totals.withdrawn -
      totals.withdrawalPending,
  );

  return {
    totals,
    definitions: ledgerDefinitions(),
    reconciliation: {
      equation:
        "available = settled earnings + adjustments − paid withdrawals − reserved withdrawals",
      ledgerAvailable: totals.availableBalance,
      recomputedAvailable,
      matches: recomputedAvailable === totals.availableBalance,
    },
    generatedAt: new Date().toISOString(),
  };
}

interface BucketRow {
  _id: string;
  value: number;
}

function toPoints(range: DashboardRange, rows: BucketRow[]): DashboardPoint[] {
  const values = new Map(rows.map((row) => [row._id, row.value]));

  return rangeBuckets(range).map((date) => {
    const key = bucketKey(date, range.granularity);

    return {
      key,
      label: bucketLabel(key, range.granularity),
      value: values.get(key) ?? 0,
    };
  });
}

async function windowEarnings(vendorId: string, range: { start: Date; end: Date }) {
  const window = { $gte: range.start, $lt: range.end };

  const [paymentRows, orderRows, payoutRows] = await Promise.all([
    Payment.aggregate<{
      gross: number;
      fees: number;
      net: number;
      count: number;
    }>([
      {
        $match: {
          vendor: objectId(vendorId),
          status: { $in: ["successful", "refunded"] },
          paidAt: window,
        },
      },
      {
        $group: {
          _id: null,
          gross: {
            $sum: {
              $cond: [{ $eq: ["$status", "successful"] }, "$amount", 0],
            },
          },
          fees: {
            $sum: {
              $cond: [{ $eq: ["$status", "successful"] }, "$platformFee", 0],
            },
          },
          net: {
            $sum: {
              $cond: [
                { $eq: ["$status", "successful"] },
                "$vendorAmount",
                { $multiply: ["$vendorAmount", -1] },
              ],
            },
          },
          count: {
            $sum: { $cond: [{ $eq: ["$status", "successful"] }, 1, 0] },
          },
        },
      },
    ]),
    Order.aggregate<{ count: number; value: number }>([
      {
        $match: {
          vendor: objectId(vendorId),
          createdAt: window,
          status: { $in: [...GMV_ORDER_STATUSES] },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$total" } } },
    ]),
    Escrow.aggregate<{ value: number; count: number }>([
      {
        $match: {
          vendor: objectId(vendorId),
          status: "released",
          releasedAt: window,
        },
      },
      { $group: { _id: null, value: { $sum: "$amountReleased" }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    gross: first(paymentRows[0]?.gross),
    fees: first(paymentRows[0]?.fees),
    net: Math.max(0, first(paymentRows[0]?.net)),
    paidOrders: first(paymentRows[0]?.count),
    orders: first(orderRows[0]?.count),
    orderValue: first(orderRows[0]?.value),
    settled: first(payoutRows[0]?.value),
    settlements: first(payoutRows[0]?.count),
  };
}

export async function getVendorFinanceAnalytics(
  vendorId: string,
  input: DashboardRangeInput,
) {
  const range = resolveDashboardRange(input);
  const previous = previousRange(range);

  const [current, prior, summary, salesRows, orderRows, settlementRows] =
    await Promise.all([
      windowEarnings(vendorId, range),
      windowEarnings(vendorId, previous),
      getVendorFinanceSummary(vendorId),
      Payment.aggregate<BucketRow>([
        {
          $match: {
            vendor: objectId(vendorId),
            status: { $in: ["successful", "refunded"] },
            paidAt: { $gte: range.start, $lt: range.end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                date: "$paidAt",
                format: bucketFormat(range.granularity),
                timezone: range.timezone,
              },
            },
            value: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "successful"] },
                  "$vendorAmount",
                  { $multiply: ["$vendorAmount", -1] },
                ],
              },
            },
          },
        },
      ]),
      Order.aggregate<BucketRow>([
        {
          $match: {
            vendor: objectId(vendorId),
            createdAt: { $gte: range.start, $lt: range.end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                date: "$createdAt",
                format: bucketFormat(range.granularity),
                timezone: range.timezone,
              },
            },
            value: { $sum: 1 },
          },
        },
      ]),
      Escrow.aggregate<BucketRow>([
        {
          $match: {
            vendor: objectId(vendorId),
            status: "released",
            releasedAt: { $gte: range.start, $lt: range.end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                date: "$releasedAt",
                format: bucketFormat(range.granularity),
                timezone: range.timezone,
              },
            },
            value: { $sum: "$amountReleased" },
          },
        },
      ]),
    ]);

  const salesPoints = toPoints(range, salesRows);
  const orderPoints = toPoints(range, orderRows);
  const settlementPoints = toPoints(range, settlementRows);

  return {
    range: toRangeDTO(range),
    current,
    previous: prior,
    change: {
      gross: percentageChange(current.gross, prior.gross),
      net: percentageChange(current.net, prior.net),
      orders: percentageChange(current.orders, prior.orders),
      orderValue: percentageChange(current.orderValue, prior.orderValue),
      settled: percentageChange(current.settled, prior.settled),
    },
    charts: [
      {
        key: "sales" as const,
        label: "Net sales",
        description:
          "Your earnings from successful payments, minus refunded earnings.",
        kind: "currency" as const,
        total: salesPoints.reduce((sum, point) => sum + point.value, 0),
        points: salesPoints,
      },
      {
        key: "orders" as const,
        label: "Orders",
        description: "Orders placed with your store in each period.",
        kind: "count" as const,
        total: orderPoints.reduce((sum, point) => sum + point.value, 0),
        points: orderPoints,
      },
      {
        key: "settlements" as const,
        label: "Escrow released",
        description:
          "Money released from escrow to your settled balance in each period.",
        kind: "currency" as const,
        total: settlementPoints.reduce((sum, point) => sum + point.value, 0),
        points: settlementPoints,
      },
    ],
    summary,
    generatedAt: new Date().toISOString(),
  };
}

export interface VendorDashboardResult {
  range: ReturnType<typeof toRangeDTO>;
  metrics: Array<{
    key: string;
    label: string;
    description: string;
    format: "number" | "currency";
    basis: "range" | "all_time";
    value: number;
    previousValue?: number;
    changePct?: number | null;
    href?: string;
  }>;
  charts: unknown[];
  pendingActions: Array<{
    key: string;
    label: string;
    description: string;
    count: number;
    href: string;
    severity: "high" | "medium" | "low";
    oldestAt: string | null;
  }>;
  recentOrders: unknown[];
  finance: VendorFinanceSummary;
  store: unknown;
  generatedAt: string;
}

export async function getVendorDashboard(
  vendorId: string,
  store: unknown,
  input: DashboardRangeInput,
): Promise<VendorDashboardResult> {
  const range = resolveDashboardRange(input);
  const previous = previousRange(range);
  const window = { $gte: range.start, $lt: range.end };

  const [
    analytics,
    pendingOrders,
    processingOrders,
    lowStock,
    recentOrders,
    pendingWithdrawalCount,
    oldestPendingOrder,
  ] = await Promise.all([
    getVendorFinanceAnalytics(vendorId, input),
    Order.countDocuments({
      vendor: vendorId,
      status: "confirmed",
      createdAt: window,
    }),
    Order.countDocuments({ vendor: vendorId, status: "processing" }),
    Product.countDocuments({
      vendor: vendorId,
      status: { $ne: "archived" },
      stock: { $lte: 5 },
    }),
    Order.find({ vendor: vendorId })
      .populate({ path: "customer", select: "name email" })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Withdrawal.countDocuments({
      vendor: vendorId,
      status: { $in: [...OPEN_WITHDRAWAL_STATUSES] },
    }),
    Order.findOne({ vendor: vendorId, status: "confirmed" })
      .sort({ createdAt: 1 })
      .select("createdAt")
      .lean(),
  ]);

  const current = analytics.current;
  const prior = analytics.previous;

  return {
    range: analytics.range,
    metrics: [
      {
        key: "grossSales",
        label: "Gross sales",
        description:
          "Value of successful customer payments for your store in the selected period.",
        format: "currency",
        basis: "range",
        value: current.gross,
        previousValue: prior.gross,
        changePct: analytics.change.gross,
        href: "/finance/transactions",
      },
      {
        key: "netEarnings",
        label: "Net earnings",
        description:
          "Your share after platform commission and refunds for the selected period.",
        format: "currency",
        basis: "range",
        value: current.net,
        previousValue: prior.net,
        changePct: analytics.change.net,
        href: "/finance",
      },
      {
        key: "pendingEarnings",
        label: "Pending earnings",
        description:
          "Escrow held for orders that have not settled yet. Not withdrawable.",
        format: "currency",
        basis: "all_time",
        value: analytics.summary.totals.pendingEarnings,
        href: "/finance",
      },
      {
        key: "availableBalance",
        label: "Available balance",
        description:
          "Settled earnings that are not already reserved by a withdrawal request.",
        format: "currency",
        basis: "all_time",
        value: analytics.summary.totals.availableBalance,
        href: "/finance/withdrawals",
      },
      {
        key: "orders",
        label: "Orders",
        description: "Orders placed with your store in the selected period.",
        format: "number",
        basis: "range",
        value: current.orders,
        previousValue: prior.orders,
        changePct: analytics.change.orders,
        href: "/orders",
      },
      {
        key: "lowStock",
        label: "Low stock",
        description:
          "Active products with five units or fewer remaining in inventory.",
        format: "number",
        basis: "all_time",
        value: lowStock,
        href: "/products?inventory=low_stock",
      },
    ],
    charts: analytics.charts,
    pendingActions: [
      {
        key: "confirm_orders",
        label: "Orders to confirm",
        description: "Paid orders waiting for you to accept them.",
        count: pendingOrders,
        href: "/orders?status=confirmed",
        severity: "high",
        oldestAt: oldestPendingOrder?.createdAt
          ? new Date(oldestPendingOrder.createdAt).toISOString()
          : null,
      },
      {
        key: "ship_orders",
        label: "Orders in processing",
        description: "Orders being prepared that still need shipment details.",
        count: processingOrders,
        href: "/orders?status=processing",
        severity: "medium",
        oldestAt: null,
      },
      {
        key: "withdrawals",
        label: "Withdrawals awaiting review",
        description: "Requests reserved from your balance but not yet paid.",
        count: pendingWithdrawalCount,
        href: "/finance/withdrawals",
        severity: "low",
        oldestAt: null,
      },
    ],
    recentOrders,
    finance: analytics.summary,
    store,
    generatedAt: new Date().toISOString(),
  };
}
