import { z } from "zod";

export const reviewStoreSchema = z
  .object({
    status: z.enum(["approved", "rejected", "suspended", "closed"]),
    rejectionReason: z.string().trim().min(5).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "rejected" && !value.rejectionReason) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectionReason"],
        message: "A rejection reason is required",
      });
    }
  });

export type ReviewStoreSchemaType = z.infer<typeof reviewStoreSchema>;
