import { z } from "zod";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
} from "@/models/order.model";
import { SHIPMENT_STATUSES } from "@/models/shipment.model";
import { FULFILLMENT_STATUSES } from "@/services/orders/status";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

export const ORDER_SORT_FIELDS = [
  "createdAt",
  "placedAt",
  "orderNumber",
  "total",
  "status",
  "paymentStatus",
] as const;

export const listOrdersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
  shipmentStatus: z.enum(SHIPMENT_STATUSES).optional(),
  /** ObjectId or a customer name/email search term. */
  customer: z.string().trim().max(120).optional(),
  /** ObjectId or a vendor/store name search term. */
  vendor: z.string().trim().max(120).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(ORDER_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const orderTimelineQuerySchema = z.object({
  type: z.enum([
    "created",
    "payment_confirmed",
    "vendor_notified",
    "processing",
    "shipment_created",
    "picked_up",
    "in_transit",
    "delivered",
    "completed",
    "cancelled",
    "refunded",
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const orderSubOrdersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  vendor: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const orderShipmentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  provider: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderTimelineQuery = z.infer<typeof orderTimelineQuerySchema>;
export type OrderSubOrdersQuery = z.infer<typeof orderSubOrdersQuerySchema>;
export type OrderShipmentsQuery = z.infer<typeof orderShipmentsQuerySchema>;
