import { z } from "zod";
import { SHIPMENT_STATUSES } from "@/models/shipment.model";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

export const SHIPMENT_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "lastEventAt",
  "trackingNumber",
  "status",
] as const;

export const listShipmentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  provider: z.string().trim().max(40).optional(),
  /** Order id, master order number or sub-order number. */
  order: z.string().trim().max(120).optional(),
  /** ObjectId or a vendor/store name search term. */
  vendor: z.string().trim().max(120).optional(),
  store: z.string().trim().max(120).optional(),
  /** ObjectId or a customer name/email search term. */
  customer: z.string().trim().max(120).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(SHIPMENT_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const shipmentTrackingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const cancelShipmentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;
export type ShipmentTrackingQuery = z.infer<typeof shipmentTrackingQuerySchema>;
export type CancelShipmentInput = z.infer<typeof cancelShipmentSchema>;
