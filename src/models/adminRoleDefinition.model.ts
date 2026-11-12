import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";
import { PERMISSIONS } from "@/config/permissions";

/**
 * Persisted role definitions.
 *
 * Built-in roles are seeded from `config/permissions.ts` on startup. Additional
 * roles can be created by a Super Admin and are resolved through the in-memory
 * registry, so authorization stays synchronous and fast.
 */
const adminRoleDefinitionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    permissions: {
      type: [String],
      enum: PERMISSIONS,
      default: [],
    },
    system: { type: Boolean, default: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

export type AdminRoleDefinitionType = InferSchemaType<
  typeof adminRoleDefinitionSchema
>;

const AdminRoleDefinition = mongoose.model(
  "AdminRoleDefinition",
  adminRoleDefinitionSchema,
);

export default AdminRoleDefinition;
export type AdminRoleDefinitionDocument =
  HydratedDocument<AdminRoleDefinitionType>;
