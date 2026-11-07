import mongoose, { type Types } from "mongoose";
import type { StoreStatus } from "@/models/store.model";
import type { StoreReviewAction } from "@/models/storeReview.model";

interface StoreHistoryInput {
  store: Types.ObjectId | string;
  action: StoreReviewAction;
  fromStatus?: StoreStatus | null;
  toStatus?: StoreStatus | null;
  actor?: Types.ObjectId | string | null;
  actorRole: "vendor" | "admin" | "system";
  reason?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends a store review record without letting an audit failure break the
 * action that produced it. The connection guard keeps unit tests that do not
 * open Mongo from buffering writes.
 *
 * The model is imported lazily so controller unit tests can mock the store
 * model without also having to mock every related collection.
 */
export async function recordStoreHistory(input: StoreHistoryInput) {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const { default: StoreReview } = await import(
      "@/models/storeReview.model"
    );

    await StoreReview.create({
      store: input.store,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actor: input.actor ?? null,
      actorRole: input.actorRole,
      reason: input.reason ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[store-history] failed to record review", error);
  }
}
