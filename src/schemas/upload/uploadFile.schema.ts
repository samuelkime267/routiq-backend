import { z } from "zod";
import { STORE_DOCUMENT_TYPES } from "@/models/store.model";

export const UPLOAD_PURPOSES = [
  "store_document",
  "store_logo",
  "store_cover",
  "profile_picture",
] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const uploadFileSchema = z
  .object({
    purpose: z.enum(UPLOAD_PURPOSES).default("store_document"),
    documentType: z.enum(STORE_DOCUMENT_TYPES).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.purpose === "store_document" && !value.documentType) {
      ctx.addIssue({
        code: "custom",
        path: ["documentType"],
        message: "Document type is required when uploading a store document",
      });
    }
  });

export type UploadFileSchemaType = z.infer<typeof uploadFileSchema>;
