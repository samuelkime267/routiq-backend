import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * Internal administrative notes attached to a vendor account.
 *
 * Notes are never exposed to vendors. `vendor` scopes the note to the profile;
 * `store` is optional context for notes written from a store review.
 */
const adminNoteSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

adminNoteSchema.index({ vendor: 1, createdAt: -1 });

export type AdminNoteType = InferSchemaType<typeof adminNoteSchema>;

const AdminNote = mongoose.model("AdminNote", adminNoteSchema);

export default AdminNote;
export type AdminNoteDocument = HydratedDocument<AdminNoteType>;
