import mongoose from "mongoose";
import Dispute, { disputeStatusVariants } from "@/models/dispute.model";
import Escrow from "@/models/escrow.model";
import Order from "@/models/order.model";
import Payment, {
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "@/models/payment.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import type { ListTransactionsQuery } from "@/schemas/transaction";
import { createError } from "@/utils";

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

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

export function transactionTypeFor(status: PaymentStatus | string) {
  return status === "refunded" ? "refund" : "payment";
}

async function buildFilter(query: ListTransactionsQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) {
    filter.status = query.status;
  } else if (query.type === "refund") {
    filter.status = "refunded";
  } else if (query.type === "payment") {
    filter.status = { $in: ["pending", "successful", "failed"] };
  }

  if (query.channel) filter.channel = query.channel;

  if (query.order) {
    const orderIds = isObjectId(query.order)
      ? [new mongoose.Types.ObjectId(query.order)]
      : await Order.find({
          $or: [
            { orderNumber: regex(query.order) },
            { masterOrderNumber: regex(query.order) },
            { subOrderNumber: regex(query.order) },
          ],
        }).distinct("_id");

    filter.order = { $in: orderIds };
  }

  if (query.customer) {
    const customerIds = isObjectId(query.customer)
      ? [new mongoose.Types.ObjectId(query.customer)]
      : await User.find({
          $or: [{ name: regex(query.customer) }, { email: regex(query.customer) }],
        }).distinct("_id");

    filter.customer = { $in: customerIds };
  }

  if (query.vendor) {
    if (isObjectId(query.vendor)) {
      filter.vendor = new mongoose.Types.ObjectId(query.vendor);
    } else {
      const [vendorIds, storeIds] = await Promise.all([
        User.find({
          $or: [{ name: regex(query.vendor) }, { email: regex(query.vendor) }],
        }).distinct("_id"),
        Store.find({ name: regex(query.vendor) }).distinct("_id"),
      ]);

      filter.$and = [
        {
          $or: [
            { vendor: { $in: vendorIds } },
            { store: { $in: storeIds } },
          ],
        },
      ];
    }
  }

  if (query.createdFrom || query.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (query.createdFrom) createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) {
      createdAt.$lte = endOfDayIfDateOnly(query.createdTo);
    }
    filter.createdAt = createdAt;
  }

  if (query.search) {
    const pattern = regex(query.search);
    const [orderIds, customerIds, vendorIds] = await Promise.all([
      Order.find({
        $or: [
          { orderNumber: pattern },
          { masterOrderNumber: pattern },
          { subOrderNumber: pattern },
        ],
      }).distinct("_id"),
      User.find({
        $or: [{ name: pattern }, { email: pattern }],
      }).distinct("_id"),
      User.find({
        $or: [{ name: pattern }, { email: pattern }],
      }).distinct("_id"),
    ]);

    filter.$or = [
      { reference: pattern },
      { order: { $in: orderIds } },
      { customer: { $in: customerIds } },
      { vendor: { $in: vendorIds } },
    ];
  }

  return filter;
}

export async function queryTransactions(query: ListTransactionsQuery) {
  const filter = await buildFilter(query);
  const skip = (query.page - 1) * query.limit;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [payments, total, summaryRows] = await Promise.all([
    Payment.find(filter)
      .populate(
        "order",
        "orderNumber masterOrderNumber subOrderNumber status paymentStatus total createdAt",
      )
      .populate("customer", "name email phone")
      .populate("vendor", "name email")
      .populate("store", "name slug status")
      .sort({ [query.sortBy]: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Payment.countDocuments(filter),
    Payment.aggregate<{
      statuses: Array<{ _id: string; count: number; amount: number; fee: number }>;
    }>([
      { $match: filter },
      {
        $facet: {
          statuses: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                amount: { $sum: "$amount" },
                fee: { $sum: "$platformFee" },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const escrows = await Escrow.find({
    payment: { $in: payments.map((payment) => payment._id) },
  }).lean();
  const escrowByPayment = new Map(
    escrows.map((escrow) => [String(escrow.payment), escrow]),
  );

  const statusCounts = PAYMENT_STATUSES.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {},
  );
  let successfulVolume = 0;
  let refundedVolume = 0;
  let platformFees = 0;

  for (const row of summaryRows[0]?.statuses ?? []) {
    if (row._id in statusCounts) statusCounts[row._id] = row.count;
    if (row._id === "successful") {
      successfulVolume += row.amount;
      platformFees += row.fee;
    }
    if (row._id === "refunded") refundedVolume += row.amount;
  }

  return {
    transactions: payments.map((payment) => ({
      ...payment,
      transactionType: transactionTypeFor(payment.status),
      escrow: escrowByPayment.get(String(payment._id)) ?? null,
    })),
    summary: {
      total,
      statusCounts,
      successfulVolume,
      refundedVolume,
      platformFees,
    },
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function findTransactionOrThrow(transactionId: string) {
  if (!isObjectId(transactionId)) {
    throw createError("Transaction not found", 404);
  }

  const payment = await Payment.findById(transactionId)
    .populate(
      "order",
      "orderNumber masterOrderNumber subOrderNumber status paymentStatus subtotal shippingFee discount total shippingAddress createdAt",
    )
    .populate("customer", "name email phone username status")
    .populate("vendor", "name email phone username status")
    .populate("store", "name slug status category logo")
    .lean();

  if (!payment) throw createError("Transaction not found", 404);

  const [escrow, disputes] = await Promise.all([
    Escrow.findOne({ payment: payment._id }).lean(),
    Dispute.find({
      order: payment.order,
      status: {
        $in: disputeStatusVariants("OPEN").concat(
          disputeStatusVariants("UNDER_REVIEW"),
          disputeStatusVariants("AWAITING_INFORMATION"),
        ),
      },
    })
      .select("reference category status subject assignedTo createdAt")
      .populate("assignedTo", "name email adminRole")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return {
    transaction: {
      ...payment,
      transactionType: transactionTypeFor(payment.status),
      escrow,
    },
    escrow,
    disputes,
    /**
     * Payment verification and provider references are not implemented in this
     * codebase. The response states that explicitly instead of pretending a
     * frontend response or an invented provider record is authoritative.
     */
    verification: {
      source: "internal_payment_record",
      providerConfigured: false,
      providerReference: null,
      message:
        "No payment provider verification integration is configured. Amounts shown come from the backend payment record, not a client response.",
    },
  };
}
