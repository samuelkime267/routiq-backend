import mongoose, { InferSchemaType, HydratedDocument } from "mongoose";
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  PERMISSIONS,
} from "@/config/permissions";

export const USER_ROLES = ["user", "vendor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "inactive", "suspended"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      select: false,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    providerId: {
      type: String,
      default: null,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationTokenExpiryDate: {
      type: Date,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetTokenExpiryDate: {
      type: Date,
      default: null,
    },
    otpLastSentAt: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "active",
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
    /**
     * Administrative accounts reuse the existing User record (and therefore
     * password hashing, JWT, refresh-cookie and reset-token infrastructure).
     * `role` stays "admin" so ordinary role gates keep working, while the
     * fields below hold admin-specific state.
     */
    adminRole: {
      type: String,
      enum: ADMIN_ROLES,
      default: null,
    },
    adminStatus: {
      type: String,
      enum: ADMIN_STATUSES,
      default: null,
    },
    permissionGrants: {
      type: [String],
      enum: PERMISSIONS,
      default: [],
    },
    permissionRevocations: {
      type: [String],
      enum: PERMISSIONS,
      default: [],
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    invitedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // Explicit timestamp fields rather than `timestamps: true`, which breaks
    // Mongoose's InferSchemaType inference for this schema. Legacy documents
    // are handled by the ObjectId fallback in the admin list controller.
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: {
      transform: (_document, returned) => {
        const result = returned as Record<string, unknown>;
        delete result.password;
        delete result.emailVerificationToken;
        delete result.emailVerificationTokenExpiryDate;
        delete result.passwordResetToken;
        delete result.passwordResetTokenExpiryDate;
        delete result.otpLastSentAt;
        delete result.otpAttempts;
        delete result.__v;

        return result;
      },
    },
  },
);

/**
 * Usernames are optional: invited administrators and Google sign-ups never
 * choose one. A plain `unique` index on the field would admit only a single
 * document without a username, so the second such account failed with E11000
 * on `{ username: null }`. The partial index only enforces uniqueness for
 * documents that actually store a string username.
 */
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: { username: { $type: "string" } },
    name: "username_1",
  },
);

// Keep the explicit `updatedAt` field honest for every save. The schema avoids
// `timestamps: true` because it degrades InferSchemaType inference.
userSchema.pre("save", function stampUpdatedAt() {
  this.updatedAt = new Date();
});

export type UserType = InferSchemaType<typeof userSchema>;

const User = mongoose.model("User", userSchema);

export default User;
export type UserDocument = HydratedDocument<UserType>;
