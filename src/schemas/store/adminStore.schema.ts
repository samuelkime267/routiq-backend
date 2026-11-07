import { z } from "zod";

const noteSchema = z.string().trim().max(1000).optional();
const reasonSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(5, `${label} must be at least 5 characters`)
    .max(1000, `${label} cannot exceed 1000 characters`);

export const approveStoreSchema = z.object({
  note: noteSchema,
});

export const rejectStoreSchema = z.object({
  reason: reasonSchema("A rejection reason"),
});

export const requestStoreInformationSchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, "Information requests need at least 10 characters")
    .max(2000, "The request cannot exceed 2000 characters"),
});

export const suspendStoreSchema = z.object({
  reason: reasonSchema("A suspension reason"),
});

export const reactivateStoreSchema = z.object({
  note: noteSchema,
});

export const listStoreHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ApproveStoreSchemaType = z.infer<typeof approveStoreSchema>;
export type RejectStoreSchemaType = z.infer<typeof rejectStoreSchema>;
export type RequestStoreInformationSchemaType = z.infer<
  typeof requestStoreInformationSchema
>;
export type SuspendStoreSchemaType = z.infer<typeof suspendStoreSchema>;
export type ReactivateStoreSchemaType = z.infer<
  typeof reactivateStoreSchema
>;
export type ListStoreHistoryQuerySchemaType = z.infer<
  typeof listStoreHistoryQuerySchema
>;
