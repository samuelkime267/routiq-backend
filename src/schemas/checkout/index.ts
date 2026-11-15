import { z } from "zod";

/**
 * Checkout contracts.
 *
 * The device sends product ids and quantities only. Every price, fee and total
 * is recalculated by the backend from the catalogue, so a tampered client can
 * change what is bought but never what it costs.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Enter a valid id");

export const checkoutItemSchema = z.object({
  productId: objectId,
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Maximum quantity per product is 99"),
  /**
   * The unit price the customer was shown. It is never used for charging; a
   * mismatch produces a `price_changed` warning so the customer re-confirms.
   */
  expectedUnitPrice: z.number().min(0).optional(),
});

const deliverySelectionsSchema = z
  .record(z.string().trim(), z.string().trim())
  .optional();

export const checkoutQuoteSchema = z.object({
  items: z
    .array(checkoutItemSchema)
    .min(1, "Your cart is empty. Add a product before checking out."),
  addressId: objectId.optional(),
  deliverySelections: deliverySelectionsSchema,
});

export const placeCheckoutSchema = z.object({
  /**
   * Client-generated idempotency key. Replaying the same request returns the
   * original orders instead of creating duplicates.
   */
  key: z
    .string()
    .trim()
    .min(8, "Checkout key is too short")
    .max(120, "Checkout key is too long"),
  items: z
    .array(checkoutItemSchema)
    .min(1, "Your cart is empty. Add a product before checking out."),
  addressId: objectId,
  deliverySelections: deliverySelectionsSchema,
  /** Optional guard: reject the submit if the total changed since the quote. */
  expectedTotal: z.number().min(0).optional(),
});

export const checkoutReferenceParamSchema = z.object({
  masterOrderNumber: z
    .string()
    .trim()
    .min(4, "Enter a checkout reference")
    .max(80, "Enter a valid checkout reference"),
});

export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
export type PlaceCheckoutBody = z.infer<typeof placeCheckoutSchema>;
