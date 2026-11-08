import { z } from "zod";

const noteSchema = z
  .string()
  .trim()
  .max(1000, "Keep the note under 1000 characters")
  .optional();

const reasonSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(5, `${label} must be at least 5 characters`)
    .max(1000, `${label} cannot exceed 1000 characters`);

export const approveProductSchema = z.object({
  note: noteSchema,
});

export const rejectProductSchema = z.object({
  reason: reasonSchema("A rejection reason"),
});

export const suspendProductSchema = z.object({
  reason: reasonSchema("A suspension reason"),
});

export const restoreProductSchema = z.object({
  note: noteSchema,
});

export type ApproveProductSchemaType = z.infer<typeof approveProductSchema>;
export type RejectProductSchemaType = z.infer<typeof rejectProductSchema>;
export type SuspendProductSchemaType = z.infer<typeof suspendProductSchema>;
export type RestoreProductSchemaType = z.infer<typeof restoreProductSchema>;
