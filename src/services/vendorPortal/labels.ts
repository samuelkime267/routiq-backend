import type { StoreStatus } from "@/models/store.model";

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  draft: "draft",
  pending: "pending review",
  under_review: "under review",
  approved: "approved",
  rejected: "rejected",
  suspended: "suspended",
  closed: "closed",
};
