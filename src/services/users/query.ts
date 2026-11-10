import mongoose from "mongoose";
import AdminNote from "@/models/adminNote.model";
import Dispute, { disputeStatusVariants } from "@/models/dispute.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Store from "@/models/store.model";
import User, {
  USER_ROLES,
  USER_STATUSES,
  type UserDocument,
} from "@/models/user.model";
import type {
  ListUsersQuery,
  UserOrdersQuery,
  UserTransactionsQuery,
} from "@/schemas/user";
import { createError } from "@/utils";

export const USER_PUBLIC_FIELDS =
  "name email phone username role status isEmailVerified profilePicture authProvider suspensionReason suspendedAt suspendedBy createdAt updatedAt lastLoginAt";

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

function dateRange(from?: string, to?: string) {
  if (!from && !to) return null;

  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = endOfDayIfDateOnly(to);

  return range;
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

interface IdCountRow {
  _id: mongoose.Types.ObjectId;
  count: number;
  value?: number;
}

function metricMap(rows: IdCountRow[], field: "count" | "value" = "count") {
  return new Map(rows.map((row) => [String(row._id), row[field] ?? 0]));
}

/**
 * Account directory.
 *
 * Reads the single `User` collection used by authentication, orders and
 * vendors. Administrators are only included when the caller can access the
 * admin module.
 */
export async function queryUsers(
  query: ListUsersQuery,
  options: { includeAdmins: boolean } = { includeAdmins: false },
) {
  const role = query.role ?? query.type;
  const scope: Record<string, unknown> = options.includeAdmins
    ? {}
    : { role: { $in: ["user", "vendor"] } };

  const filter: Record<string, unknown> = { ...scope };

  if (role) filter.role = role;
  if (query.status) filter.status = query.status;

  const range = dateRange(query.createdFrom, query.createdTo);
  if (range) filter.createdAt = range;

  if (query.search) {
    const pattern = regex(query.search);
    filter.$or = [
      { name: pattern },
      { email: pattern },
      { username: pattern },
      { phone: pattern },
    ];
  }

  const sort: Record<string, 1 | -1> = {
    [query.sortBy]: query.sortOrder === "asc" ? 1 : -1,
  };
  const skip = (query.page - 1) * query.limit;

  const [users, total, summaryRows] = await Promise.all([
    User.find(filter)
      .select(USER_PUBLIC_FIELDS)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
    User.aggregate<{ roles: Array<{ _id: string; count: number }>; statuses: Array<{ _id: string; count: number }> }>([
      { $match: scope },
      {
        $facet: {
          roles: [{ $group: { _id: "$role", count: { $sum: 1 } } }],
          statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        },
      },
    ]),
  ]);

  const ids = users.map((user) => user._id);
  const idList = ids.map((id) => new mongoose.Types.ObjectId(String(id)));

  const [customerOrders, vendorOrders, customerValue, vendorValue, disputes] =
    ids.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
          Order.aggregate<IdCountRow>([
            { $match: { customer: { $in: idList } } },
            { $group: { _id: "$customer", count: { $sum: 1 } } },
          ]),
          Order.aggregate<IdCountRow>([
            { $match: { vendor: { $in: idList } } },
            { $group: { _id: "$vendor", count: { $sum: 1 } } },
          ]),
          Payment.aggregate<IdCountRow>([
            {
              $match: {
                customer: { $in: idList },
                status: "successful",
              },
            },
            {
              $group: {
                _id: "$customer",
                count: { $sum: 1 },
                value: { $sum: "$amount" },
              },
            },
          ]),
          Payment.aggregate<IdCountRow>([
            { $match: { vendor: { $in: idList }, status: "successful" } },
            {
              $group: {
                _id: "$vendor",
                count: { $sum: 1 },
                value: { $sum: "$vendorAmount" },
              },
            },
          ]),
          Dispute.aggregate<IdCountRow>([
            { $match: { raisedBy: { $in: idList } } },
            { $group: { _id: "$raisedBy", count: { $sum: 1 } } },
          ]),
        ]);

  const customerOrderMap = metricMap(customerOrders as IdCountRow[]);
  const vendorOrderMap = metricMap(vendorOrders as IdCountRow[]);
  const customerValueMap = metricMap(customerValue as IdCountRow[], "value");
  const vendorValueMap = metricMap(vendorValue as IdCountRow[], "value");
  const disputeMap = metricMap(disputes as IdCountRow[]);

  const roleSummary = USER_ROLES.reduce<Record<string, number>>(
    (accumulator, value) => {
      accumulator[value] = 0;
      return accumulator;
    },
    {},
  );
  const statusSummary = USER_STATUSES.reduce<Record<string, number>>(
    (accumulator, value) => {
      accumulator[value] = 0;
      return accumulator;
    },
    {},
  );

  for (const row of summaryRows[0]?.roles ?? []) {
    if (row._id in roleSummary) roleSummary[row._id] = row.count;
  }
  for (const row of summaryRows[0]?.statuses ?? []) {
    if (row._id in statusSummary) statusSummary[row._id] = row.count;
  }

  return {
    users: users.map((user) => {
      const id = String(user._id);
      const isVendor = user.role === "vendor";

      return {
        ...user,
        metrics: {
          orders: isVendor
            ? (vendorOrderMap.get(id) ?? 0)
            : (customerOrderMap.get(id) ?? 0),
          customerOrders: customerOrderMap.get(id) ?? 0,
          vendorOrders: vendorOrderMap.get(id) ?? 0,
          transactionValue: isVendor
            ? (vendorValueMap.get(id) ?? 0)
            : (customerValueMap.get(id) ?? 0),
          customerSpend: customerValueMap.get(id) ?? 0,
          vendorProceeds: vendorValueMap.get(id) ?? 0,
          disputes: disputeMap.get(id) ?? 0,
        },
      };
    }),
    summary: {
      roles: roleSummary,
      statuses: statusSummary,
      total: total,
    },
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function findUserOrThrow(userId: string): Promise<UserDocument> {
  if (!isObjectId(userId)) throw createError("User not found", 404);

  const user = await User.findById(userId);
  if (!user) throw createError("User not found", 404);

  return user;
}

/**
 * Everything the support workspace needs for one account. The recent
 * collections are capped; the dedicated endpoints paginate the full history.
 */
export async function loadUserDetail(user: UserDocument) {
  const userId = new mongoose.Types.ObjectId(String(user._id));
  const isVendor = user.role === "vendor";
  const relation = isVendor ? { vendor: userId } : { customer: userId };

  const [
    orderMetrics,
    paymentMetrics,
    disputeCount,
    recentOrders,
    recentTransactions,
    disputes,
    store,
    notes,
  ] = await Promise.all([
    Order.aggregate<{ count: number; value: number; delivered: number }>([
      { $match: relation },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          value: { $sum: "$total" },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
        },
      },
    ]),
    Payment.aggregate<{ count: number; value: number; refunded: number }>([
      { $match: relation },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          value: {
            $sum: {
              $cond: [
                { $eq: ["$status", "successful"] },
                isVendor ? "$vendorAmount" : "$amount",
                0,
              ],
            },
          },
          refunded: {
            $sum: {
              $cond: [
                { $eq: ["$status", "refunded"] },
                isVendor ? "$vendorAmount" : "$amount",
                0,
              ],
            },
          },
        },
      },
    ]),
    Dispute.countDocuments({ raisedBy: userId }),
    Order.find(relation)
      .populate("customer", "name email phone")
      .populate("vendor", "name email")
      .populate("store", "name slug status")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Payment.find(relation)
      .populate("order", "orderNumber masterOrderNumber subOrderNumber status total")
      .populate("customer", "name email")
      .populate("vendor", "name email")
      .populate("store", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Dispute.find({
      $or: [{ raisedBy: userId }, { vendor: userId }],
    })
      .populate("order", "orderNumber masterOrderNumber subOrderNumber total")
      .populate("assignedTo", "name email adminRole")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    isVendor
      ? Store.findOne({ owner: userId }).sort({ createdAt: 1 }).lean()
      : Promise.resolve(null),
    isVendor
      ? AdminNote.find({ vendor: userId })
          .populate("author", "name email adminRole")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      : Promise.resolve([]),
  ]);

  const orders = orderMetrics[0];
  const payments = paymentMetrics[0];

  return {
    user: user.toJSON(),
    store,
    metrics: {
      orders: orders?.count ?? 0,
      orderValue: orders?.value ?? 0,
      deliveredOrders: orders?.delivered ?? 0,
      transactions: payments?.count ?? 0,
      transactionValue: payments?.value ?? 0,
      refundedValue: payments?.refunded ?? 0,
      disputes: disputeCount,
    },
    recentOrders,
    recentTransactions,
    disputes,
    notes,
  };
}

export async function queryUserOrders(
  user: UserDocument,
  query: UserOrdersQuery,
) {
  const side = query.side ?? (user.role === "vendor" ? "vendor" : "customer");
  const filter: Record<string, unknown> = {
    [side]: new mongoose.Types.ObjectId(String(user._id)),
  };

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  const range = dateRange(query.createdFrom, query.createdTo);
  if (range) filter.createdAt = range;

  if (query.search) {
    const pattern = regex(query.search);
    filter.$or = [
      { orderNumber: pattern },
      { masterOrderNumber: pattern },
      { subOrderNumber: pattern },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("customer", "name email phone")
      .populate("vendor", "name email")
      .populate("store", "name slug status")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return {
    side,
    orders,
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function queryUserTransactions(
  user: UserDocument,
  query: UserTransactionsQuery,
) {
  const side = query.side ?? (user.role === "vendor" ? "vendor" : "customer");
  const filter: Record<string, unknown> = {
    [side]: new mongoose.Types.ObjectId(String(user._id)),
  };

  if (query.status) filter.status = query.status;
  if (query.channel) filter.channel = query.channel;

  const range = dateRange(query.createdFrom, query.createdTo);
  if (range) filter.createdAt = range;

  if (query.search) {
    const pattern = regex(query.search);
    const orderIds = await Order.find({
      $or: [
        { orderNumber: pattern },
        { masterOrderNumber: pattern },
        { subOrderNumber: pattern },
      ],
    }).distinct("_id");

    filter.$or = [
      { reference: pattern },
      { order: { $in: orderIds } },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [transactions, total] = await Promise.all([
    Payment.find(filter)
      .populate("order", "orderNumber masterOrderNumber subOrderNumber status total")
      .populate("customer", "name email")
      .populate("vendor", "name email")
      .populate("store", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    side,
    transactions,
    pagination: pagination(query.page, query.limit, total),
  };
}

/** Normalises a dispute status for a user's support history. */
export function userDisputeStatusFilter(statuses: readonly string[]) {
  return statuses.flatMap((status) =>
    disputeStatusVariants(status as never),
  );
}
