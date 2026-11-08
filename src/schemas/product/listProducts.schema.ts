import { z } from "zod";
import {
  PRODUCT_PUBLICATION_STATUSES,
  PRODUCT_STATUSES,
} from "@/models/product.model";

export const ADMIN_PRODUCT_SORT_FIELDS = [
  "name",
  "price",
  "stock",
  "status",
  "publicationStatus",
  "createdAt",
  "reviewedAt",
] as const;

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Enter a valid id")
  .optional();

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

const optionalMoney = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0).optional(),
);

const baseProductQuery = {
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  vendor: objectId,
  store: objectId,
  minPrice: optionalMoney,
  maxPrice: optionalMoney,
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(ADMIN_PRODUCT_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const listProductsQuerySchema = z.object({
  ...baseProductQuery,
  status: z.enum(PRODUCT_STATUSES).optional(),
  publicationStatus: z.enum(PRODUCT_PUBLICATION_STATUSES).optional(),
});

export const pendingProductsQuerySchema = z.object({
  ...baseProductQuery,
  sortBy: z.enum(["createdAt", "price", "name"]).default("createdAt"),
});

export type ListProductsQuerySchemaType = z.infer<
  typeof listProductsQuerySchema
>;
export type PendingProductsQuerySchemaType = z.infer<
  typeof pendingProductsQuerySchema
>;
