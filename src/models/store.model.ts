import mongoose, { InferSchemaType, HydratedDocument } from "mongoose";
import { NIGERIAN_STATES } from "@/config/nigeria";

export enum BusinessType {
  INDIVIDUAL = "individual",
  SOLE_PROPRIETORSHIP = "sole_proprietorship",
  PARTNERSHIP = "partnership",
  LIMITED_COMPANY = "limited_company",
  OTHER = "other",
}

export const STORE_STATUSES = [
  "draft",
  "pending",
  "under_review",
  "approved",
  "rejected",
  "suspended",
  "closed",
] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const STORE_DOCUMENT_TYPES = [
  "cac_certificate",
  "business_name_certificate",
  "tin_certificate",
  "utility_bill",
  "government_id",
  "bank_statement",
  "other",
] as const;
export type StoreDocumentType = (typeof STORE_DOCUMENT_TYPES)[number];

export const ID_TYPES = [
  "nin",
  "bvn",
  "passport",
  "drivers_license",
  "voters_card",
] as const;
export type IdType = (typeof ID_TYPES)[number];

export const OPERATING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type OperatingDay = (typeof OPERATING_DAYS)[number];

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    lga: { type: String, required: true, trim: true },
    state: { type: String, enum: [...NIGERIAN_STATES], required: true },
    country: { type: String, required: true, default: "Nigeria", trim: true },
    landmark: { type: String, default: null, trim: true },
    postalCode: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const operatingHourSchema = new mongoose.Schema(
  {
    day: { type: String, enum: [...OPERATING_DAYS], required: true },
    isOpen: { type: Boolean, required: true },
    openingTime: { type: String, default: null },
    closingTime: { type: String, default: null },
  },
  { _id: false },
);

const representativeSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true, default: "Nigerian" },
    idType: { type: String, enum: [...ID_TYPES], required: true },
    idNumber: { type: String, required: true, trim: true },
    nin: { type: String, default: null, trim: true },
    bvn: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const settlementAccountSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true, trim: true },
    bankCode: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const storeDocumentSchema = new mongoose.Schema({
  type: { type: String, enum: [...STORE_DOCUMENT_TYPES], required: true },
  url: { type: String, required: true, trim: true },
  name: { type: String, default: null, trim: true },
  uploadedAt: { type: Date, default: Date.now },
});

const complianceSchema = new mongoose.Schema(
  {
    termsAccepted: { type: Boolean, required: true },
    dataProcessingConsent: { type: Boolean, required: true },
    acceptedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const storeSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    legalBusinessName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    businessType: {
      type: String,
      enum: Object.values(BusinessType),
      default: BusinessType.INDIVIDUAL,
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    cacRegistrationNumber: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
    },
    tin: {
      type: String,
      default: null,
      trim: true,
    },
    scumlNumber: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
    },
    businessRegistrationDate: {
      type: Date,
      default: null,
    },
    logo: {
      type: String,
      default: null,
    },
    coverImage: {
      type: String,
      default: null,
    },
    /**
     * Curated marketplace placement. An unapproved or suspended store is never
     * public even when featured.
     */
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: [...STORE_STATUSES],
      default: "pending",
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    suspensionReason: {
      type: String,
      default: null,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    address: {
      type: addressSchema,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    operatingHours: {
      type: [operatingHourSchema],
      default: [],
    },
    pickupInstructions: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    representative: {
      type: representativeSchema,
      required: true,
    },
    settlementAccount: {
      type: settlementAccountSchema,
      required: true,
    },
    documents: {
      type: [storeDocumentSchema],
      default: [],
    },
    compliance: {
      type: complianceSchema,
      required: true,
    },
  },
  { timestamps: true },
);

storeSchema.index({ location: "2dsphere" });
storeSchema.index({ owner: 1, createdAt: -1 });
storeSchema.index({ featured: 1, createdAt: -1 });

export type StoreType = InferSchemaType<typeof storeSchema>;

const Store = mongoose.model("Store", storeSchema);

export default Store;
export type StoreDocument = HydratedDocument<StoreType>;
