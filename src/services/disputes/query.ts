import mongoose from "mongoose";
import Dispute, {
  DISPUTE_CATEGORIES,
  DISPUTE_STATUSES,
  disputeCategoryFor,
  disputeStatusVariants,
  normalizeDisputeStatus,
  type DisputeCategory,
  type DisputeDocument,
  type DisputeHistoryAction,
  type DisputeStatus,
} from "@/models/dispute.model";
import Order from "@/models/order.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import type {
  AssignDisputeInput,
  CreateDisputeNoteInput,
  ListDisputesQuery,
  ResolveDisputeInput,
  UpdateDisputeStatusInput,
} from "@/schemas/dispute";
import { createError } from "@/utils";
import type { AdminSubject } from "@/utils/adminAccess";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit } from "@/lib/audit";

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

/**
 * Legacy `type` values grouped by the canonical support category. A filter for
 * `payment` therefore still finds old `refund` rows.
 */
export const CATEGORY_TYPE_VARIANTS: Record<DisputeCategory, string[]> = {
  payment: ["payment", "refund"],
  order: ["order", "other"],
  delivery: ["delivery", "non_delivery"],
  product: ["product", "damaged_item", "wrong_item"],
  vendor: ["vendor"],
};

const DISPUTE_POPULATE = [
  {
    path: "order",
    select:
      "orderNumber masterOrderNumber subOrderNumber status paymentStatus total customer vendor store createdAt",
  },
  { path: "raisedBy", select: "name email phone username status" },
  { path: "vendor", select: "name email phone username status" },
  { path: "store", select: "name slug status category logo" },
  { path: "assignedTo", select: "name email adminRole adminStatus" },
  { path: "assignedBy", select: "name email adminRole" },
  { path: "history.actor", select: "name email adminRole" },
  { path: "notes.author", select: "name email adminRole" },
  { path: "evidence.addedBy", select: "name email adminRole" },
];

async function buildFilter(
  query: ListDisputesQuery,
  currentAdminId: string,
) {
  const filter: Record<string, unknown> = {};

  if (query.status) {
    filter.status = { $in: disputeStatusVariants(query.status) };
  }

  if (query.category) {
    filter.$and = [
      ...((filter.$and as Record<string, unknown>[]) ?? []),
      {
        $or: [
          { category: query.category },
          {
            category: { $exists: false },
            type: { $in: CATEGORY_TYPE_VARIANTS[query.category] },
          },
        ],
      },
    ];
  }

  if (query.priority) filter.priority = query.priority;

  if (query.assignedTo) {
    if (query.assignedTo === "me") {
      filter.assignedTo = new mongoose.Types.ObjectId(currentAdminId);
    } else if (query.assignedTo === "unassigned") {
      filter.assignedTo = null;
    } else if (isObjectId(query.assignedTo)) {
      filter.assignedTo = new mongoose.Types.ObjectId(query.assignedTo);
    } else {
      throw createError("Enter a valid assignee filter", 400);
    }
  }

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

    filter.raisedBy = { $in: customerIds };
  }

  if (query.vendor) {
    const [vendorIds, storeIds] = isObjectId(query.vendor)
      ? [[new mongoose.Types.ObjectId(query.vendor)] as unknown, [] as unknown[]]
      : await Promise.all([
          User.find({
            $or: [
              { name: regex(query.vendor) },
              { email: regex(query.vendor) },
            ],
          }).distinct("_id"),
          Store.find({ name: regex(query.vendor) }).distinct("_id"),
        ]);

    filter.$and = [
      ...((filter.$and as Record<string, unknown>[]) ?? []),
      {
        $or: [
          { vendor: { $in: vendorIds } },
          { store: { $in: storeIds } },
        ],
      },
    ];
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
    const [orderIds, userIds, storeIds] = await Promise.all([
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
      Store.find({ name: pattern }).distinct("_id"),
    ]);

    filter.$or = [
      { reference: pattern },
      { subject: pattern },
      { description: pattern },
      { order: { $in: orderIds } },
      { raisedBy: { $in: userIds } },
      { vendor: { $in: userIds } },
      { store: { $in: storeIds } },
    ];
  }

  return filter;
}

export async function queryDisputes(
  query: ListDisputesQuery,
  currentAdminId: string,
) {
  const filter = await buildFilter(query, currentAdminId);
  const summaryFilter = { ...filter };
  delete summaryFilter.status;

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const skip = (query.page - 1) * query.limit;

  const [disputes, total, statusRows] = await Promise.all([
    Dispute.find(filter)
      .populate(DISPUTE_POPULATE as never)
      .sort({ [query.sortBy]: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Dispute.countDocuments(filter),
    Dispute.aggregate<{ _id: string; count: number }>([
      { $match: summaryFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = DISPUTE_STATUSES.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {},
  );

  for (const row of statusRows) {
    const canonical = normalizeDisputeStatus(row._id);
    if (canonical) statusCounts[canonical] += row.count;
  }

  return {
    disputes: disputes.map(decorateDispute),
    summary: { statuses: statusCounts, total },
    pagination: pagination(query.page, query.limit, total),
  };
}

/** Normalises legacy status/category values and adds computed fields. */
export function decorateDispute(
  dispute: Record<string, unknown> | DisputeDocument,
): Record<string, unknown> {
  const plain =
    typeof (dispute as DisputeDocument).toObject === "function"
      ? ((dispute as DisputeDocument).toObject() as Record<string, unknown>)
      : (dispute as Record<string, unknown>);

  const status = normalizeDisputeStatus(String(plain.status ?? "")) ?? "OPEN";

  return {
    ...plain,
    status,
    category: disputeCategoryFor(
      plain.type as string | null,
      plain.category as string | null,
    ),
    isOpen: !["RESOLVED", "CLOSED"].includes(status),
  };
}

export async function findDisputeOrThrow(disputeId: string) {
  if (!isObjectId(disputeId)) throw createError("Dispute not found", 404);

  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw createError("Dispute not found", 404);

  return dispute;
}

export async function loadDisputeDetail(dispute: DisputeDocument) {
  await dispute.populate(DISPUTE_POPULATE as never);

  const plain = decorateDispute(dispute.toObject() as Record<string, unknown>);

  return {
    dispute: plain,
    order: plain.order ?? null,
    customer: plain.raisedBy ?? null,
    vendor: plain.vendor ?? null,
    store: plain.store ?? null,
    assignment: {
      assignedTo: plain.assignedTo ?? null,
      assignedBy: plain.assignedBy ?? null,
      assignedAt: plain.assignedAt ?? null,
    },
    history: ((plain.history as Array<Record<string, unknown>>) ?? [])
      .slice()
      .sort(
        (left, right) =>
          new Date(String(left.createdAt)).getTime() -
          new Date(String(right.createdAt)).getTime(),
      ),
    notes: (plain.notes as Array<Record<string, unknown>>) ?? [],
    evidence: (plain.evidence as Array<Record<string, unknown>>) ?? [],
    /**
     * Resolving a dispute only changes the support record. Any refund or escrow
     * release has to be performed through the existing payment/escrow rules, so
     * the detail states that no financial mutation happened here.
     */
    financials: {
      orderTotal: (plain.order as { total?: number } | null)?.total ?? null,
      escrowModified: false,
      note:
        "Dispute actions never modify payment or escrow records. Refunds and releases remain separate, audited operations.",
    },
  };
}

export const DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  OPEN: ["UNDER_REVIEW", "AWAITING_INFORMATION", "RESOLVED", "CLOSED"],
  UNDER_REVIEW: ["AWAITING_INFORMATION", "RESOLVED", "CLOSED"],
  AWAITING_INFORMATION: ["UNDER_REVIEW", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function canTransitionDispute(
  from: DisputeStatus,
  to: DisputeStatus,
): boolean {
  return DISPUTE_TRANSITIONS[from].includes(to);
}

interface HistoryEntry {
  action: DisputeHistoryAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt?: Date;
}

function pushHistory(
  dispute: DisputeDocument,
  actorId: string | null,
  entry: HistoryEntry,
) {
  const history = dispute.history as unknown as Array<Record<string, unknown>>;

  history.push({
    action: entry.action,
    fromStatus: entry.fromStatus ?? null,
    toStatus: entry.toStatus ?? null,
    note: entry.note ?? null,
    actor: actorId,
    createdAt: entry.createdAt ?? new Date(),
  });
}

function activityFor(
  dispute: DisputeDocument,
  admin: ReturnType<typeof actorFromUser>,
  title: string,
  description: string,
  metadata: Record<string, unknown>,
) {
  return recordActivity({
    type: "admin_action",
    channel: "administration",
    title,
    description,
    actor: admin,
    subject: { type: "dispute", id: dispute._id, label: dispute.reference },
    href: `/disputes/${String(dispute._id)}`,
    metadata,
  });
}

function auditFor(
  dispute: DisputeDocument,
  admin: AdminSubject,
  action: string,
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>,
  reason?: string | null,
) {
  return recordAudit({
    actor: auditActorFromUser(admin),
    action,
    entityType: "dispute",
    entityId: dispute._id,
    entityLabel: dispute.reference,
    previousState,
    newState,
    reason: reason ?? null,
  });
}

export async function assignDispute(
  disputeId: string,
  admin: AdminSubject,
  input: AssignDisputeInput,
) {
  const dispute = await findDisputeOrThrow(disputeId);
  const targetId = input.adminId ?? String(admin._id);
  const currentStatus =
    normalizeDisputeStatus(String(dispute.status)) ?? "OPEN";

  if (currentStatus === "CLOSED") {
    throw createError("A closed dispute cannot be reassigned", 400);
  }

  const target = await User.findOne({
    _id: targetId,
    role: "admin",
    adminStatus: "ACTIVE",
  }).select("name email adminRole");

  if (!target) throw createError("Administrator not found", 404);

  const previousAssignee = dispute.assignedTo
    ? String(dispute.assignedTo)
    : null;

  dispute.assignedTo = target._id as never;
  dispute.assignedBy = admin._id as never;
  dispute.assignedAt = new Date();
  pushHistory(dispute, String(admin._id), {
    action: "assigned",
    fromStatus: dispute.status,
    toStatus: dispute.status,
    note: input.note ?? `Assigned to ${target.name}`,
  });

  await dispute.save();

  await activityFor(
    dispute,
    actorFromUser(admin),
    "Dispute assigned",
    `${dispute.reference} was assigned to ${target.name}.`,
    {
      assignedTo: String(target._id),
      previousAssignee,
      note: input.note ?? null,
    },
  );

  await auditFor(
    dispute,
    admin,
    "dispute.assigned",
    { assignedTo: previousAssignee },
    {
      assignedTo: String(target._id),
      assignedToName: target.name,
      note: input.note ?? null,
    },
    input.note ?? null,
  );

  return dispute;
}

export async function updateDisputeStatus(
  disputeId: string,
  admin: AdminSubject,
  input: UpdateDisputeStatusInput,
) {
  const dispute = await findDisputeOrThrow(disputeId);
  const from = normalizeDisputeStatus(String(dispute.status)) ?? "OPEN";
  const to = input.status;

  if (!canTransitionDispute(from, to)) {
    throw createError(
      `A dispute cannot move from ${from} to ${to}`,
      400,
    );
  }

  if (to === "RESOLVED" && !input.resolution) {
    throw createError("A resolution is required", 422);
  }

  if (to === "AWAITING_INFORMATION" && !input.message) {
    throw createError("An information request message is required", 422);
  }

  dispute.status = to;
  dispute.updatedAt = new Date();

  if (to === "AWAITING_INFORMATION") {
    dispute.informationRequest = input.message ?? null;
  }

  if (to === "RESOLVED") {
    dispute.resolution = input.resolution ?? null;
    dispute.resolvedAt = new Date();
  }

  if (to === "CLOSED") {
    dispute.closedAt = new Date();
  }

  pushHistory(dispute, String(admin._id), {
    action:
      to === "AWAITING_INFORMATION"
        ? "information_requested"
        : to === "RESOLVED"
          ? "resolved"
          : to === "CLOSED"
            ? "closed"
            : "status_changed",
    fromStatus: from,
    toStatus: to,
    note:
      to === "AWAITING_INFORMATION"
        ? input.message
        : to === "RESOLVED"
          ? (input.resolution ?? input.note ?? null)
          : (input.note ?? null),
  });

  await dispute.save();

  await activityFor(
    dispute,
    actorFromUser(admin),
    `Dispute moved to ${to.replace(/_/g, " ").toLowerCase()}`,
    to === "AWAITING_INFORMATION"
      ? `${dispute.reference} is waiting for more information.`
      : to === "RESOLVED"
        ? `${dispute.reference} was resolved.`
        : `${dispute.reference} changed from ${from} to ${to}.`,
    {
      fromStatus: from,
      toStatus: to,
      message: input.message ?? null,
      resolution: input.resolution ?? null,
      note: input.note ?? null,
      escrowModified: false,
    },
  );

  await auditFor(
    dispute,
    admin,
    to === "RESOLVED" ? "dispute.resolved" : "dispute.status_changed",
    { status: from },
    {
      status: to,
      message: input.message ?? null,
      resolution: input.resolution ?? null,
      note: input.note ?? null,
      escrowModified: false,
    },
    input.note ?? null,
  );

  return dispute;
}

export async function addDisputeNote(
  disputeId: string,
  admin: AdminSubject,
  input: CreateDisputeNoteInput,
) {
  const dispute = await findDisputeOrThrow(disputeId);
  const notes = dispute.notes as unknown as Array<Record<string, unknown>>;

  notes.push({
    body: input.body,
    author: admin._id,
    createdAt: new Date(),
  });

  pushHistory(dispute, String(admin._id), {
    action: "note_added",
    fromStatus: dispute.status,
    toStatus: dispute.status,
    note: input.body,
  });

  dispute.updatedAt = new Date();
  await dispute.save();

  await activityFor(
    dispute,
    actorFromUser(admin),
    "Internal note added",
    `An internal note was added to ${dispute.reference}.`,
    { noteId: notes[notes.length - 1]?._id ?? null },
  );

  await auditFor(
    dispute,
    admin,
    "dispute.note_added",
    {},
    { noteId: notes[notes.length - 1]?._id ?? null },
    input.body,
  );

  return dispute;
}

export async function resolveDispute(
  disputeId: string,
  admin: AdminSubject,
  input: ResolveDisputeInput,
) {
  const dispute = await findDisputeOrThrow(disputeId);
  const from = normalizeDisputeStatus(String(dispute.status)) ?? "OPEN";

  if (from === "CLOSED") {
    throw createError("A closed dispute cannot be resolved again", 400);
  }

  if (from === "RESOLVED") {
    throw createError("This dispute is already resolved", 400);
  }

  dispute.status = "RESOLVED";
  dispute.resolution = input.resolution;
  dispute.resolvedAt = new Date();
  dispute.updatedAt = new Date();

  pushHistory(dispute, String(admin._id), {
    action: "resolved",
    fromStatus: from,
    toStatus: "RESOLVED",
    note: input.note ? `${input.resolution} — ${input.note}` : input.resolution,
  });

  await dispute.save();

  await activityFor(
    dispute,
    actorFromUser(admin),
    "Dispute resolved",
    `${dispute.reference} was resolved.`,
    {
      fromStatus: from,
      toStatus: "RESOLVED",
      resolution: input.resolution,
      note: input.note ?? null,
      escrowModified: false,
    },
  );

  await auditFor(
    dispute,
    admin,
    "dispute.resolved",
    { status: from },
    {
      status: "RESOLVED",
      resolution: input.resolution,
      note: input.note ?? null,
      escrowModified: false,
    },
    input.resolution,
  );

  return dispute;
}

/** Supports the category tabs on the directory. */
export const DISPUTE_CATEGORY_VALUES = DISPUTE_CATEGORIES;
