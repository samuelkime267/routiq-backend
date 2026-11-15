import { z } from "zod";
import { NIGERIAN_PHONE_REGEX, NIGERIAN_STATES } from "@/config/nigeria";

/**
 * Customer delivery address contracts.
 *
 * The fields mirror the store address shape so delivery quotes can compare a
 * pickup and a drop-off address with the same provider payload. `country` is
 * fixed for now: Routiq only delivers within Nigeria.
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, label)
    .max(max, `${label} is too long`);

export const createAddressSchema = z
  .object({
    label: z.string().trim().max(40, "Label is too long").optional(),
    recipientName: trimmed(2, 120, "Recipient name"),
    phone: z
      .string()
      .trim()
      .regex(
        NIGERIAN_PHONE_REGEX,
        "Enter a valid Nigerian phone number (for example 08012345678)",
      ),
    street: trimmed(5, 240, "Street address"),
    city: trimmed(2, 120, "City"),
    lga: trimmed(2, 120, "Local government area"),
    state: z.enum(NIGERIAN_STATES, {
      message: "Select a Nigerian state",
    }),
    country: z.literal("Nigeria").optional(),
    landmark: z.string().trim().max(240, "Landmark is too long").optional(),
    postalCode: z
      .string()
      .trim()
      .max(20, "Postal code is too long")
      .optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateAddressSchema = createAddressSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update",
  );

export const addressIdParamSchema = z.object({
  addressId: z.string().regex(/^[a-f\d]{24}$/i, "Enter a valid address id"),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
