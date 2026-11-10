import { z } from "zod";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
} from "@/models/order.model";
import {
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
} from "@/models/payment.model";
import { USER_ROLES, USER_STATUSES } from "@/models/user.model";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

export const USER_SORT_FIELDS = [
  "name",
  "email",
  "role",
  "status",
  "createdAt",
  "lastLoginAt",
] as const;

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** Canonical account type. `type` is accepted as a UI-friendly alias. */
  role: z.enum(USER_ROLES).optional(),
  type: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(USER_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userOrdersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  /**
   * A vendor account can both sell and buy. `side` selects which relationship
   * to list; it defaults from the target account's role.
   */
  side: z.enum(["customer", "vendor"]).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userTransactionsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  channel: z.enum(PAYMENT_CHANNELS).optional(),
  side: z.enum(["customer", "vendor"]).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateUserStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.status === "suspended" &&
      (!value.reason || value.reason.length < 5)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A suspension reason of at least 5 characters is required",
      });
    }
  });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UserOrdersQuery = z.infer<typeof userOrdersQuerySchema>;
export type UserTransactionsQuery = z.infer<
  typeof userTransactionsQuerySchema
>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
