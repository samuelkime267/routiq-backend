import { z } from "zod";
import { STORE_STATUSES } from "@/models/store.model";

export const ADMIN_STORE_SORT_FIELDS = [
  "name",
  "status",
  "category",
  "submittedAt",
  "reviewedAt",
  "createdAt",
] as const;

export const listStoresQuerySchema = z.object({
  status: z.enum(STORE_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  sortBy: z.enum(ADMIN_STORE_SORT_FIELDS).default("submittedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListStoresQuerySchemaType = z.infer<typeof listStoresQuerySchema>;
