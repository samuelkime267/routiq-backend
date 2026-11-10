import mongoose from "mongoose";
import { GMV_ORDER_STATUSES } from "@/models/order.model";
import Order from "@/models/order.model";
import Escrow from "@/models/escrow.model";
import Payment from "@/models/payment.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import type { ReconciliationQuery } from "@/schemas/financial";
import {
  bucketFormat,
  bucketKey,
  bucketLabel,
  percentageChange,
  previousRange,
  rangeBuckets,
  toRangeDTO,
  type DashboardRange,
} from "@/services/dashboard";

/**
 * Financial reporting service.
 *
 * The marketplace keeps four different money concepts and they must never be
 * merged:
 *
 * - GMV: value of orders placed (cancelled/refunded orders excluded).
 * - Successful payment volume: cash actually collected.
 * - Marketplace commission: the platform fee stored on successful payments.
 * - Escrow balance: vendor proceeds held for orders not yet released. This is a
 *   liability, not realised revenue.
 *
 * Refunds and settlements are reported separately so a refund cannot be
 * mistaken for new revenue. There is no payment-provider or blockchain client in
 * this codebase, so reconciliation compares the internal payment ledger with the
 * internal escrow ledger and explicitly reports that external verification is
 * not configured.
 */

export type ReconciliationResult =
  | "matched"
  | "missing"
  | "amount_mismatch"
  | "status_mismatch";

const MONEY_FIELDS = [
  "amount",
  "platformFee",
  "vendorAmount",
] as const;

interface MoneyTotals {
  gmv: number;
  paymentVolume: number;
  commission: number;
  refundVolume: number;
  refundedCommission: number;
  settlementVolume: number;
  netRevenue: number;
  escrowBalance: number;
  orders: number;
  successfulPayments: number;
  refunds: number;
  releases: number;
}

const emptyTotals = (): MoneyTotals => ({
  gmv: 0,
  paymentVolume: 0,
  commission: 0,
  refundVolume: 0,
  refundedCommission: 0,
  settlementVolume: 0,
  netRevenue: 0,
  escrowBalance: 0,
  orders: 0,
  successfulPayments: 0,
  refunds: 0,
  releases: 0,
});

const first = (value: number | undefined) => value ?? 0;

interface MoneyRow {
  _id: null;
  value: number;
  count: number;
}

/** All-time escrow liability: held entries minus any releases and refunds. */
export async function currentEscrowBalance(): Promise<number> {
  const rows = await Escrow.aggregate<MoneyRow>([
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
        count: { $sum: 1 },
      },
    },
  ]);

  return Math.max(0, first(rows[0]?.value));
}

interface PaymentWindowTotals {
  volume: number;
  commission: number;
  count: number;
}

async function successfulPaymentsIn(
  range: { start: Date; end: Date },
): Promise<PaymentWindowTotals> {
  const rows = await Payment.aggregate<MoneyRow>([
    {
      $match: {
        status: "successful",
        paidAt: { $gte: range.start, $lt: range.end },
      },
    },
    {
      $group: {
        _id: null,
        value: { $sum: "$amount" },
        fee: { $sum: "$platformFee" },
        count: { $sum: 1 },
      },
    },
    { $project: { value: 1, commission: "$fee", count: 1 } },
  ]);

  return {
    volume: first(rows[0]?.value),
    commission: (rows[0] as { commission?: number } | undefined)?.commission ?? 0,
    count: first(rows[0]?.count),
  };
}

/**
 * Refunds have no dedicated timestamp, so a refund is attributed to the date the
 * original payment was collected. That keeps a refund inside the same reporting
 * period as the cash it reverses instead of lumping every historical refund into
 * the day the record was last updated.
 */
async function refundsIn(range: {
  start: Date;
  end: Date;
}): Promise<PaymentWindowTotals> {
  const rows = await Payment.aggregate<MoneyRow>([
    {
      $match: {
        status: "refunded",
        paidAt: { $gte: range.start, $lt: range.end },
      },
    },
    {
      $group: {
        _id: null,
        value: { $sum: "$amount" },
        fee: { $sum: "$platformFee" },
        count: { $sum: 1 },
      },
    },
    { $project: { value: 1, commission: "$fee", count: 1 } },
  ]);

  return {
    volume: first(rows[0]?.value),
    commission: (rows[0] as { commission?: number } | undefined)?.commission ?? 0,
    count: first(rows[0]?.count),
  };
}

async function gmvIn(range: { start: Date; end: Date }) {
  const rows = await Order.aggregate<MoneyRow>([
    {
      $match: {
        status: { $in: [...GMV_ORDER_STATUSES] },
        createdAt: { $gte: range.start, $lt: range.end },
      },
    },
    {
      $group: {
        _id: null,
        value: { $sum: "$total" },
        count: { $sum: 1 },
      },
    },
  ]);

  return { value: first(rows[0]?.value), count: first(rows[0]?.count) };
}

async function settlementsIn(range: { start: Date; end: Date }) {
  const rows = await Escrow.aggregate<MoneyRow>([
    {
      $match: {
        status: "released",
        releasedAt: { $gte: range.start, $lt: range.end },
      },
    },
    {
      $group: {
        _id: null,
        value: { $sum: "$amountReleased" },
        count: { $sum: 1 },
      },
    },
  ]);

  return { value: first(rows[0]?.value), count: first(rows[0]?.count) };
}

async function moneyTotals(range: {
  start: Date;
  end: Date;
}): Promise<MoneyTotals> {
  const [gmv, successful, refunds, settlements, escrowBalance] =
    await Promise.all([
      gmvIn(range),
      successfulPaymentsIn(range),
      refundsIn(range),
      settlementsIn(range),
      currentEscrowBalance(),
    ]);

  return {
    gmv: gmv.value,
    paymentVolume: successful.volume,
    commission: successful.commission,
    refundVolume: refunds.volume,
    refundedCommission: refunds.commission,
    settlementVolume: settlements.value,
    netRevenue: Math.max(0, successful.commission - refunds.commission),
    escrowBalance,
    orders: gmv.count,
    successfulPayments: successful.count,
    refunds: refunds.count,
    releases: settlements.count,
  };
}

export interface FinancialOverviewResult {
  range: ReturnType<typeof toRangeDTO>;
  totals: MoneyTotals;
  previous: MoneyTotals;
  change: Record<
    | "gmv"
    | "paymentVolume"
    | "commission"
    | "refundVolume"
    | "settlementVolume"
    | "netRevenue",
    number | null
  >;
  /** Explains the business rule behind each fixture so the UI can show it. */
  definitions: Record<string, string>;
  /** Escrow is a liability and therefore intentionally all-time. */
  escrowBasis: "all_time";
  generatedAt: string;
}

export async function getFinancialOverview(
  range: DashboardRange,
): Promise<FinancialOverviewResult> {
  const previous = previousRange(range);
  const [totals, previousTotals] = await Promise.all([
    moneyTotals({ start: range.start, end: range.end }),
    moneyTotals(previous),
  ]);

  return {
    range: toRangeDTO(range),
    totals,
    previous: previousTotals,
    change: {
      gmv: percentageChange(totals.gmv, previousTotals.gmv),
      paymentVolume: percentageChange(
        totals.paymentVolume,
        previousTotals.paymentVolume,
      ),
      commission: percentageChange(
        totals.commission,
        previousTotals.commission,
      ),
      refundVolume: percentageChange(
        totals.refundVolume,
        previousTotals.refundVolume,
      ),
      settlementVolume: percentageChange(
        totals.settlementVolume,
        previousTotals.settlementVolume,
      ),
      netRevenue: percentageChange(
        totals.netRevenue,
        previousTotals.netRevenue,
      ),
    },
    definitions: {
      gmv:
        "Value of orders placed in the period, excluding cancelled and refunded orders.",
      paymentVolume: "Cash collected on successful payments in the period.",
      commission: "Platform commission stored on successful payments.",
      refundVolume: "Payments refunded, attributed to the original payment date.",
      settlementVolume: "Escrow amounts released to vendors in the period.",
      netRevenue:
        "Commission on successful payments minus commission reversed by refunds. Escrow is excluded.",
      escrowBalance:
        "Vendor proceeds still held in escrow. A liability, not realised revenue, so it is reported all-time.",
    },
    escrowBasis: "all_time",
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Revenue breakdown                                                    */
/* ------------------------------------------------------------------ */

interface BucketRow {
  _id: string;
  value: number;
  count: number;
}

function bucketSeries(
  range: DashboardRange,
  rows: BucketRow[],
): Array<{ key: string; label: string; value: number; count: number }> {
  const values = new Map(rows.map((row) => [row._id, row]));

  return rangeBuckets(range).map((date) => {
    const key = bucketKey(date, range.granularity);
    const row = values.get(key);

    return {
      key,
      label: bucketLabel(key, range.granularity),
      value: row?.value ?? 0,
      count: row?.count ?? 0,
    };
  });
}

export interface RevenueVendorRow {
  vendorId: string | null;
  name: string;
  email: string | null;
  stores: string[];
  commission: number;
  refundedCommission: number;
  netRevenue: number;
  paymentVolume: number;
  payments: number;
}

export async function getRevenueReport(range: DashboardRange) {
  const format = bucketFormat(range.granularity);
  const window = { $gte: range.start, $lt: range.end };
  const bucket = (field: string) => ({
    $dateToString: { date: field, format, timezone: range.timezone },
  });

  const [commissionSeries, refundSeries, vendors] = await Promise.all([
    Payment.aggregate<BucketRow>([
      {
        $match: {
          status: "successful",
          paidAt: window,
        },
      },
      {
        $group: {
          _id: bucket("$paidAt"),
          value: { $sum: "$platformFee" },
          count: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate<BucketRow>([
      { $match: { status: "refunded", paidAt: window } },
      {
        $group: {
          _id: bucket("$paidAt"),
          value: { $sum: "$platformFee" },
          count: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate<{
      _id: mongoose.Types.ObjectId;
      commission: number;
      refundedCommission: number;
      paymentVolume: number;
      payments: number;
    }>([
      {
        $match: {
          status: { $in: ["successful", "refunded"] },
          paidAt: window,
        },
      },
      {
        $group: {
          _id: "$vendor",
          commission: {
            $sum: {
              $cond: [{ $eq: ["$status", "successful"] }, "$platformFee", 0],
            },
          },
          refundedCommission: {
            $sum: {
              $cond: [{ $eq: ["$status", "refunded"] }, "$platformFee", 0],
            },
          },
          paymentVolume: {
            $sum: {
              $cond: [{ $eq: ["$status", "successful"] }, "$amount", 0],
            },
          },
          successfulPayments: {
            $sum: { $cond: [{ $eq: ["$status", "successful"] }, 1, 0] },
          },
          payments: { $sum: 1 },
        },
      },
      { $sort: { commission: -1 } },
      { $limit: 15 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
          pipeline: [{ $project: { name: 1, email: 1 } }],
        },
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id",
          foreignField: "owner",
          as: "stores",
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    ]),
  ]);

  const totals = await moneyTotals({ start: range.start, end: range.end });

  const vendorRows: RevenueVendorRow[] = vendors.map((row) => ({
    vendorId: row._id ? String(row._id) : null,
    name:
      (row as unknown as { vendor?: { name?: string } }).vendor?.name ??
      "Deleted vendor",
    email:
      (row as unknown as { vendor?: { email?: string } }).vendor?.email ?? null,
    stores:
      ((row as unknown as { stores?: Array<{ name?: string }> }).stores ?? [])
        .map((store) => store.name ?? "")
        .filter(Boolean),
    commission: row.commission,
    refundedCommission: row.refundedCommission,
    netRevenue: Math.max(0, row.commission - row.refundedCommission),
    paymentVolume: row.paymentVolume,
    payments:
      (row as unknown as { successfulPayments?: number }).successfulPayments ??
      row.payments,
  }));

  return {
    range: toRangeDTO(range),
    totals,
    series: {
      commission: bucketSeries(range, commissionSeries),
      refunds: bucketSeries(range, refundSeries),
    },
    vendors: vendorRows,
    platform: {
      commission: totals.commission,
      refundedCommission: totals.refundedCommission,
      netRevenue: totals.netRevenue,
    },
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Reconciliation                                                       */
/* ------------------------------------------------------------------ */

interface EscrowLedgerLike {
  amountHeld?: number | null;
  amountReleased?: number | null;
  amountRefunded?: number | null;
  status?: string | null;
}

/**
 * Classifies one internal payment against its escrow ledger record.
 *
 * Only backend records are compared; a client-side payment response is never
 * evidence that money moved. Exported for unit tests.
 */
export function classifyReconciliation(
  payment: { status?: string | null; vendorAmount?: number | null },
  escrow?: EscrowLedgerLike | null,
): ReconciliationResult {
  if (!escrow) return "missing";

  const expected = Number(payment.vendorAmount ?? 0);
  const held = Number(escrow.amountHeld ?? 0);

  if (Math.abs(expected - held) > 0.5) return "amount_mismatch";

  if (payment.status === "refunded" && escrow.status !== "refunded") {
    return "status_mismatch";
  }

  if (
    payment.status === "successful" &&
    !["held", "released"].includes(String(escrow.status))
  ) {
    return "status_mismatch";
  }

  return "matched";
}

const isObjectId = (value?: string | null) =>
  Boolean(value && /^[a-f\d]{24}$/i.test(value));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const regex = (value: string) => new RegExp(escapeRegExp(value), "i");

const RECONCILIATION_PROJECTION = {
  reference: 1,
  order: 1,
  customer: 1,
  vendor: 1,
  amount: 1,
  platformFee: 1,
  vendorAmount: 1,
  currency: 1,
  status: 1,
  channel: 1,
  paidAt: 1,
  createdAt: 1,
};

function reconciliationPipeline(
  range: DashboardRange,
  query: ReconciliationQuery,
): mongoose.PipelineStage[] {
  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        status: { $in: ["successful", "refunded"] },
        paidAt: { $gte: range.start, $lt: range.end },
      },
    },
    {
      $lookup: {
        from: Escrow.collection.name,
        localField: "_id",
        foreignField: "payment",
        as: "escrowRecords",
      },
    },
    {
      $addFields: {
        escrow: { $first: "$escrowRecords" },
        result: {
          $switch: {
            branches: [
              { case: { $eq: [{ $size: "$escrowRecords" }, 0] }, then: "missing" },
              {
                case: {
                  $gt: [
                    {
                      $abs: {
                        $subtract: [
                          { $ifNull: ["$vendorAmount", 0] },
                          { $ifNull: [{ $first: "$escrowRecords.amountHeld" }, 0] },
                        ],
                      },
                    },
                    0.5,
                  ],
                },
                then: "amount_mismatch",
              },
              {
                case: {
                  $and: [
                    { $eq: ["$status", "refunded"] },
                    {
                      $ne: [
                        { $first: "$escrowRecords.status" },
                        "refunded",
                      ],
                    },
                  ],
                },
                then: "status_mismatch",
              },
              {
                case: {
                  $and: [
                    { $eq: ["$status", "successful"] },
                    {
                      $not: [
                        {
                          $in: [
                            { $first: "$escrowRecords.status" },
                            ["held", "released"],
                          ],
                        },
                      ],
                    },
                  ],
                },
                then: "status_mismatch",
              },
            ],
            default: "matched",
          },
        },
      },
    },
    {
      $lookup: {
        from: Order.collection.name,
        localField: "order",
        foreignField: "_id",
        as: "orderRecord",
        pipeline: [
          {
            $project: {
              orderNumber: 1,
              masterOrderNumber: 1,
              subOrderNumber: 1,
              status: 1,
              paymentStatus: 1,
              total: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "customer",
        foreignField: "_id",
        as: "customerRecord",
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "vendor",
        foreignField: "_id",
        as: "vendorRecord",
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    {
      $lookup: {
        from: Store.collection.name,
        localField: "vendor",
        foreignField: "owner",
        as: "storeRecords",
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    {
      $addFields: {
        orderRecord: { $first: "$orderRecord" },
        customerRecord: { $first: "$customerRecord" },
        vendorRecord: { $first: "$vendorRecord" },
        storeNames: "$storeRecords.name",
      },
    },
  ];

  if (query.result) {
    pipeline.push({ $match: { result: query.result } });
  }

  if (query.search) {
    const pattern = regex(query.search);
    pipeline.push({
      $match: {
        $or: [
          { reference: pattern },
          { "orderRecord.orderNumber": pattern },
          { "orderRecord.masterOrderNumber": pattern },
          { "orderRecord.subOrderNumber": pattern },
          { "customerRecord.name": pattern },
          { "customerRecord.email": pattern },
          { "vendorRecord.name": pattern },
          { "vendorRecord.email": pattern },
        ],
      },
    });
  }

  return pipeline;
}

export async function getReconciliationReport(
  range: DashboardRange,
  query: ReconciliationQuery,
) {
  const pipeline = reconciliationPipeline(range, query);
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const sortField =
    query.sortBy === "reference"
      ? "reference"
      : query.sortBy === "amount"
        ? "amount"
        : "createdAt";
  const skip = (query.page - 1) * query.limit;

  const [facet] = await Payment.aggregate<{
    rows: Array<Record<string, unknown>>;
    counts: Array<{ _id: string; count: number; amount: number }>;
    totals: Array<{ count: number; unpaid: number; expected: number }>;
  }>([
    ...pipeline,
    {
      $facet: {
        rows: [
          { $sort: { [sortField]: sortDirection, _id: sortDirection } },
          { $skip: skip },
          { $limit: query.limit },
          {
            $project: {
              ...RECONCILIATION_PROJECTION,
              escrow: {
                _id: 1,
                status: 1,
                amountHeld: 1,
                amountReleased: 1,
                amountRefunded: 1,
                heldAt: 1,
                releasedAt: 1,
              },
              result: 1,
              orderRecord: 1,
              customerRecord: 1,
              vendorRecord: 1,
              storeNames: 1,
              expectedEscrowAmount: "$vendorAmount",
              recordedEscrowAmount: "$escrow.amountHeld",
            },
          },
        ],
        counts: [
          {
            $group: {
              _id: "$result",
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              unpaid: {
                $sum: { $cond: [{ $eq: ["$result", "matched"] }, 0, 1] },
              },
              expected: { $sum: "$vendorAmount" },
            },
          },
        ],
      },
    },
  ]);

  const summary = {
    matched: 0,
    missing: 0,
    amount_mismatch: 0,
    status_mismatch: 0,
  } as Record<ReconciliationResult, number>;

  for (const row of facet?.counts ?? []) {
    if (row._id in summary) summary[row._id as ReconciliationResult] = row.count;
  }

  const total = facet?.totals[0]?.count ?? 0;
  const unresolved = facet?.totals[0]?.unpaid ?? 0;

  return {
    range: toRangeDTO(range),
    records: (facet?.rows ?? []).map((row) => ({
      ...row,
      order: row.orderRecord ?? null,
      customer: row.customerRecord ?? null,
      vendor: row.vendorRecord ?? null,
      stores: row.storeNames ?? [],
    })),
    summary: {
      ...summary,
      total,
      unresolved,
    },
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
    /**
     * The backend has no payment-provider or blockchain client. Internal
     * payments can be checked against the escrow ledger, but they cannot be
     * verified against an external source of truth. The UI must show this as
     * unconfigured rather than presenting a match as provider confirmation.
     */
    externalVerification: {
      configured: false,
      provider: null,
      checkedAt: null,
      source: "internal_ledger_only" as const,
      message:
        "No payment-provider or blockchain verification integration is configured. Results compare internal payments with the internal escrow ledger.",
    },
    generatedAt: new Date().toISOString(),
  };
}
