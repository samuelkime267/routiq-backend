import { z } from "zod";
import { DASHBOARD_RANGES } from "@/services/dashboard/range";

export const RECONCILIATION_RESULTS = [
  "matched",
  "missing",
  "amount_mismatch",
  "status_mismatch",
] as const;
export type ReconciliationResult = (typeof RECONCILIATION_RESULTS)[number];

export const RECONCILIATION_SORT_FIELDS = [
  "createdAt",
  "amount",
  "reference",
] as const;

const dateKey = z.string().trim().optional();

export const reconciliationQuerySchema = z.object({
  range: z.enum(DASHBOARD_RANGES).default("30d"),
  from: dateKey,
  to: dateKey,
  result: z.enum(RECONCILIATION_RESULTS).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(RECONCILIATION_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;
