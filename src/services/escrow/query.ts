import mongoose from "mongoose";
import Dispute from "@/models/dispute.model";
import Escrow, {
  ESCROW_STATUSES,
  type EscrowDocument,
} from "@/models/escrow.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import type { ListEscrowsQuery } from "@/schemas/escrow";
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

export function releaseStatusFor(escrow: {
  status: string;
  releaseDueAt?: Date | string | null;
  releasedAt?: Date | string | null;
}, now = Date.now()) {
  if (escrow.status === "released") return "released";
  if (escrow.status === "refunded") return "refunded";

  if (escrow.releaseDueAt) {
    const due = new Date(escrow.releaseDueAt).getTime();
    if (!Number.isNaN(due) && due <= now) return "due";
  }

  return "scheduled";
}

export function availableHeld(escrow: Record<string, unknown>) {
  return Math.max(
    0,
    Number(escrow.amountHeld ?? 0) -
      Number(escrow.amountReleased ?? 0) -
      Number(escrow.amountRefunded ?? 0),
  );
}

async function buildFilter(query: ListEscrowsQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;

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

  if (query.customer) {
    const customerIds = isObjectId(query.customer)
      ? [new mongoose.Types.ObjectId(query.customer)]
      : await User.find({
          $or: [{ name: regex(query.customer) }, { email: regex(query.customer) }],
        }).distinct("_id");

    const orderIds = await Order.find({
      customer: { $in: customerIds },
    }).distinct("_id");

    filter.order = { $in: orderIds };
  }

  if (query.createdFrom || query.createdTo) {
    const heldAt: Record<string, Date> = {};
    if (query.createdFrom) heldAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) heldAt.$lte = endOfDayIfDateOnly(query.createdTo);
    filter.heldAt = heldAt;
  }

  if (query.search) {
    const pattern = regex(query.search);
    const [orderIds, paymentIds] = await Promise.all([
      Order.find({
        $or: [
          { orderNumber: pattern },
          { masterOrderNumber: pattern },
          { subOrderNumber: pattern },
        ],
      }).distinct("_id"),
      Payment.find({ reference: pattern }).distinct("_id"),
    ]);

    filter.$or = [
      { order: { $in: orderIds } },
      { payment: { $in: paymentIds } },
    ];
  }

  return filter;
}

export async function queryEscrows(query: ListEscrowsQuery) {
  const filter = await buildFilter(query);
  const skip = (query.page - 1) * query.limit;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [escrows, total, summaryRows] = await Promise.all([
    Escrow.find(filter)
      .populate({
        path: "order",
        select:
          "orderNumber masterOrderNumber subOrderNumber customer vendor store status paymentStatus total createdAt",
        populate: [
          { path: "customer", select: "name email phone" },
          { path: "vendor", select: "name email" },
          { path: "store", select: "name slug status" },
        ],
      })
      .populate("payment", "reference status amount platformFee vendorAmount channel paidAt")
      .sort({ [query.sortBy]: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Escrow.countDocuments(filter),
    Escrow.aggregate<{
      statuses: Array<{
        _id: string;
        count: number;
        held: number;
        released: number;
        refunded: number;
      }>;
    }>([
      { $match: filter },
      {
        $facet: {
          statuses: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                held: { $sum: "$amountHeld" },
                released: { $sum: "$amountReleased" },
                refunded: { $sum: "$amountRefunded" },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const orderIds = escrows
    .map(
      (escrow) =>
        (escrow.order as { _id?: mongoose.Types.ObjectId } | null)?._id,
    )
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
  const disputes = await Dispute.find({ order: { $in: orderIds } })
    .select("reference order category status subject updatedAt")
    .sort({ createdAt: -1 })
    .lean();
  const disputeByOrder = new Map(
    disputes.map((dispute) => [String(dispute.order), dispute]),
  );

  const statusCounts = ESCROW_STATUSES.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {},
  );
  let heldBalance = 0;
  let releasedVolume = 0;
  let refundedVolume = 0;

  for (const row of summaryRows[0]?.statuses ?? []) {
    if (row._id in statusCounts) statusCounts[row._id] = row.count;
    heldBalance += row.held - row.released - row.refunded;
    releasedVolume += row.released;
    refundedVolume += row.refunded;
  }

  return {
    escrows: escrows.map((escrow) => {
      const plain = escrow as unknown as Record<string, unknown>;
      const order = plain.order as Record<string, unknown> | null;

      return {
        ...plain,
        availableHeld: availableHeld(plain),
        releaseStatus: releaseStatusFor({
          status: String(plain.status),
          releaseDueAt: plain.releaseDueAt as Date | null,
          releasedAt: plain.releasedAt as Date | null,
        }),
        dispute: order
          ? (disputeByOrder.get(String(order._id)) ?? null)
          : null,
        blockchain: {
          supported: false,
          reference: null,
          network: null,
        },
      };
    }),
    summary: {
      total,
      statusCounts,
      heldBalance: Math.max(0, heldBalance),
      releasedVolume,
      refundedVolume,
    },
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function findEscrowOrThrow(escrowId: string) {
  if (!isObjectId(escrowId)) throw createError("Escrow record not found", 404);

  const escrow = await Escrow.findById(escrowId);
  if (!escrow) throw createError("Escrow record not found", 404);

  return escrow;
}

/**
 * Escrow monitoring record. This endpoint is read-only: the marketplace has no
 * contract write client, so it never offers a release or refund action.
 */
export async function loadEscrowDetail(escrow: EscrowDocument) {
  const plain = escrow.toObject() as Record<string, unknown>;

  const [order, payment, disputes] = await Promise.all([
    Order.findById(escrow.order)
      .populate("customer", "name email phone username status")
      .populate("vendor", "name email phone username status")
      .populate("store", "name slug status category logo")
      .lean(),
    Payment.findById(escrow.payment).lean(),
    Dispute.find({ order: escrow.order })
      .populate("assignedTo", "name email adminRole")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return {
    escrow: {
      ...plain,
      availableHeld: availableHeld(plain),
      releaseStatus: releaseStatusFor({
        status: escrow.status,
        releaseDueAt: escrow.releaseDueAt,
        releasedAt: escrow.releasedAt,
      }),
    },
    order,
    payment,
    customer:
      order && typeof order.customer === "object" ? order.customer : null,
    vendor:
      order && typeof order.vendor === "object" ? order.vendor : null,
    store: order && typeof order.store === "object" ? order.store : null,
    disputes,
    settlement: {
      amountHeld: escrow.amountHeld,
      amountReleased: escrow.amountReleased,
      amountRefunded: escrow.amountRefunded,
      availableHeld: availableHeld(plain),
      releaseDueAt: escrow.releaseDueAt,
      releasedAt: escrow.releasedAt,
      releaseStatus: releaseStatusFor({
        status: escrow.status,
        releaseDueAt: escrow.releaseDueAt,
        releasedAt: escrow.releasedAt,
      }),
    },
    /**
     * No smart-contract or blockchain settlement integration exists in this
     * codebase. Reporting `supported: false` is deliberate: the console must
     * not imply an on-chain operation that the backend cannot perform.
     */
    blockchain: {
      supported: false,
      reference: null,
      network: null,
      message:
        "Escrow is recorded in the marketplace ledger. No smart-contract or blockchain settlement client is configured.",
    },
  };
}
