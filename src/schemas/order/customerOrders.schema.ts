import { z } from "zod";
import { ORDER_STATUSES } from "@/models/order.model";

/**
 * Customer order list query.
 *
 * The customer is always taken from the access token; there is deliberately no
 * customer id parameter that could be pointed at someone else's orders.
 */
export const customerOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const customerOrderParamSchema = z.object({
  reference: z.string().trim().min(4).max(80),
});

export type CustomerOrdersQuery = z.infer<typeof customerOrdersQuerySchema>;
