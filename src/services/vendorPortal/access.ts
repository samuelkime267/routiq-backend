import Store, { type StoreDocument } from "@/models/store.model";
import type { UserDocument } from "@/models/user.model";
import { createError } from "@/utils";
import { STORE_STATUS_LABELS } from "@/services/vendorPortal/labels";

/**
 * Every vendor-scoped endpoint resolves the caller's own store first.
 *
 * Ownership is never taken from a request parameter: the store is looked up by
 * the authenticated user id, so a vendor cannot read or mutate another
 * vendor's records even if they guess an id. The single-store rule matches
 * store creation, which already allows one store per vendor account.
 */
export async function loadVendorStore(
  vendor: Pick<UserDocument, "_id" | "role" | "status">,
): Promise<StoreDocument> {
  if (vendor.role !== "vendor") {
    throw createError("This area is only available to vendor accounts", 403);
  }

  const store = await Store.findOne({ owner: vendor._id });

  if (!store) {
    throw createError(
      "You do not have a store yet. Complete store onboarding to start selling.",
      404,
    );
  }

  return store;
}

/** Reasons a vendor cannot manage catalogue or orders yet. */
export function storeTradingIssue(store: StoreDocument): string | null {
  if (store.status === "approved") return null;

  if (store.status === "suspended") {
    return "Your store is suspended. Selling and withdrawals are paused until an administrator reactivates it.";
  }

  if (store.status === "closed") {
    return "Your store is closed. Reopen it through support before selling again.";
  }

  if (store.status === "rejected") {
    return "Your store application was rejected. Update the application and resubmit it for review.";
  }

  return `Your store is ${STORE_STATUS_LABELS[store.status]?.toLowerCase() ?? store.status}. Selling becomes available once it is approved.`;
}

/** Catalogue and fulfilment writes require a live, approved store. */
export function assertVendorCanSell(store: StoreDocument) {
  const issue = storeTradingIssue(store);

  if (issue) throw createError(issue, 403);
}

/**
 * Finance reads are allowed while onboarding so a vendor can see the empty
 * state, but money can only move for an approved store.
 */
export function assertVendorCanWithdraw(store: StoreDocument) {
  assertVendorCanSell(store);
}

export function storeAccessSummary(store: StoreDocument) {
  const issue = storeTradingIssue(store);

  return {
    status: store.status,
    canSell: issue === null,
    canWithdraw: issue === null,
    restriction: issue,
  };
}
