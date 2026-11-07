import { z } from "zod";
import {
  BANK_ACCOUNT_REGEX,
  BANK_CODE_REGEX,
  BVN_REGEX,
  CAC_REGISTRATION_REGEX,
  NIGERIAN_PHONE_REGEX,
  NIGERIAN_STATES,
  NIN_REGEX,
  SCUML_REGEX,
  TIN_REGEX,
} from "@/config/nigeria";
import {
  BusinessType,
  ID_TYPES,
  OPERATING_DAYS,
  STORE_DOCUMENT_TYPES,
} from "@/models/store.model";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const addressSchema = z.object({
  street: z.string().trim().min(3, "Street address is required").max(200),
  city: z.string().trim().min(2, "City is required").max(100),
  lga: z.string().trim().min(2, "Local government area is required").max(100),
  state: z.enum(NIGERIAN_STATES, "A valid Nigerian state is required"),
  country: z.literal("Nigeria").default("Nigeria"),
  landmark: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

const operatingHourSchema = z
  .object({
    day: z.enum(OPERATING_DAYS),
    isOpen: z.boolean(),
    openingTime: z.string().regex(timeRegex, "Use HH:mm").nullable().optional(),
    closingTime: z.string().regex(timeRegex, "Use HH:mm").nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.isOpen) return;

    if (!value.openingTime) {
      ctx.addIssue({
        code: "custom",
        path: ["openingTime"],
        message: "Opening time is required when the store is open",
      });
    }
    if (!value.closingTime) {
      ctx.addIssue({
        code: "custom",
        path: ["closingTime"],
        message: "Closing time is required when the store is open",
      });
    }
    if (
      value.openingTime &&
      value.closingTime &&
      value.openingTime >= value.closingTime
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["closingTime"],
        message: "Closing time must be after opening time",
      });
    }
  });

const representativeSchema = z
  .object({
    fullName: z.string().trim().min(3, "Representative name is required").max(200),
    dateOfBirth: z.string().regex(isoDateRegex, "Use YYYY-MM-DD"),
    nationality: z.string().trim().min(2).max(100).default("Nigerian"),
    idType: z.enum(ID_TYPES),
    idNumber: z.string().trim().min(4, "ID number is required").max(50),
    nin: z.string().regex(NIN_REGEX, "NIN must be 11 digits").optional(),
    bvn: z.string().regex(BVN_REGEX, "BVN must be 11 digits").optional(),
  })
  .superRefine((value, ctx) => {
    const dateOfBirth = new Date(`${value.dateOfBirth}T00:00:00.000Z`);
    const minimumAge = new Date();
    minimumAge.setFullYear(minimumAge.getFullYear() - 18);

    if (Number.isNaN(dateOfBirth.getTime())) {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Enter a valid date of birth",
      });
    } else if (dateOfBirth > minimumAge) {
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Representative must be at least 18 years old",
      });
    }

    if (!value.nin && !value.bvn) {
      ctx.addIssue({
        code: "custom",
        path: ["nin"],
        message: "Provide either a NIN or BVN for KYB verification",
      });
    }
  });

const settlementAccountSchema = z.object({
  bankName: z.string().trim().min(2, "Bank name is required").max(100),
  bankCode: z.string().regex(BANK_CODE_REGEX, "Invalid bank code"),
  accountName: z.string().trim().min(3, "Account name is required").max(200),
  accountNumber: z
    .string()
    .regex(BANK_ACCOUNT_REGEX, "Account number must be 10 digits"),
});

const storeDocumentSchema = z.object({
  type: z.enum(STORE_DOCUMENT_TYPES),
  url: z.url("Document URL must be a valid URL"),
  name: z.string().trim().max(200).optional(),
});

const complianceSchema = z.object({
  termsAccepted: z.literal(true, "You must accept the marketplace terms"),
  dataProcessingConsent: z.literal(
    true,
    "You must consent to KYB data processing",
  ),
});

export const storeBaseSchema = z.object({
  name: z.string().trim().min(3, "Store name is required").max(120),
  legalBusinessName: z
    .string()
    .trim()
    .min(3, "Registered business name is required")
    .max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug can contain lowercase letters, numbers and hyphens",
    )
    .max(80)
    .optional(),
  email: z.email("Invalid store email address"),
  phoneNumber: z
    .string()
    .regex(NIGERIAN_PHONE_REGEX, "Use a valid Nigerian phone number"),
  description: z.string().trim().max(1000).optional(),
  businessType: z.enum(BusinessType),
  category: z.string().trim().min(2, "Business category is required").max(80),
  cacRegistrationNumber: z
    .string()
    .regex(CAC_REGISTRATION_REGEX, "Enter a valid CAC RC/BN/IT number")
    .optional(),
  tin: z.string().regex(TIN_REGEX, "TIN must be 8 to 15 digits").optional(),
  scumlNumber: z
    .string()
    .regex(SCUML_REGEX, "Enter a valid SCUML number")
    .optional(),
  businessRegistrationDate: z
    .string()
    .regex(isoDateRegex, "Use YYYY-MM-DD")
    .optional(),
  logo: z.url("Logo must be a valid URL").optional(),
  coverImage: z.url("Cover image must be a valid URL").optional(),
  address: addressSchema,
  location: z.object({
    type: z.literal("Point").default("Point"),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
  operatingHours: z
    .array(operatingHourSchema)
    .min(1, "Add at least one operating day")
    .max(7),
  pickupInstructions: z.string().trim().max(1000).optional(),
  representative: representativeSchema,
  settlementAccount: settlementAccountSchema,
  documents: z
    .array(storeDocumentSchema)
    .min(1, "Upload at least one KYB document"),
  compliance: complianceSchema,
});

export const createStoreSchema = storeBaseSchema.superRefine((value, ctx) => {
  const isRegisteredBusiness =
    value.businessType !== BusinessType.INDIVIDUAL;
  const documentTypes = value.documents.map((document) => document.type);

  if (isRegisteredBusiness && !value.cacRegistrationNumber) {
    ctx.addIssue({
      code: "custom",
      path: ["cacRegistrationNumber"],
      message: "CAC registration number is required for registered businesses",
    });
  }
  if (isRegisteredBusiness && !value.tin) {
    ctx.addIssue({
      code: "custom",
      path: ["tin"],
      message: "TIN is required for registered businesses",
    });
  }
  if (!documentTypes.includes("government_id")) {
    ctx.addIssue({
      code: "custom",
      path: ["documents"],
      message: "A government-issued ID document is required",
    });
  }
  if (!documentTypes.includes("utility_bill")) {
    ctx.addIssue({
      code: "custom",
      path: ["documents"],
      message: "A utility bill or proof of address is required",
    });
  }
  if (
    isRegisteredBusiness &&
    !documentTypes.includes("cac_certificate") &&
    !documentTypes.includes("business_name_certificate")
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["documents"],
      message: "A CAC certificate is required for registered businesses",
    });
  }

  const days = value.operatingHours.map((entry) => entry.day);
  if (new Set(days).size !== days.length) {
    ctx.addIssue({
      code: "custom",
      path: ["operatingHours"],
      message: "Each operating day can only be listed once",
    });
  }
});

export type CreateStoreSchemaType = z.infer<typeof createStoreSchema>;
