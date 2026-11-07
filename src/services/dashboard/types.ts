import type { DashboardRange } from "./range";

export type DashboardMetricKey =
  | "totalUsers"
  | "totalVendors"
  | "activeVendors"
  | "totalStores"
  | "pendingStoreApprovals"
  | "totalProducts"
  | "pendingProductApprovals"
  | "totalOrders"
  | "grossMerchandiseValue"
  | "marketplaceRevenue"
  | "escrowBalance"
  | "unresolvedDisputes";

export type DashboardMetricBasis = "all_time" | "range";
export type DashboardValueFormat = "number" | "currency";

export interface DashboardMetric {
  key: DashboardMetricKey;
  label: string;
  /** The business rule behind the number, shown in the UI. */
  description: string;
  basis: DashboardMetricBasis;
  format: DashboardValueFormat;
  value: number;
  previousValue?: number;
  /** `null` means "no comparable previous value" (division by zero). */
  changePct?: number | null;
}

export type DashboardSeriesKey =
  | "orders"
  | "salesVolume"
  | "marketplaceRevenue"
  | "vendorRegistrations"
  | "storeApprovals";

export interface DashboardPoint {
  /** Stable bucket key in the marketplace timezone. */
  key: string;
  label: string;
  value: number;
}

export interface DashboardSeries {
  key: DashboardSeriesKey;
  label: string;
  description: string;
  kind: "count" | "currency";
  total: number;
  points: DashboardPoint[];
}

export type DashboardPendingActionKey =
  | "store_approvals"
  | "product_moderation"
  | "delayed_orders"
  | "failed_shipments"
  | "unresolved_disputes"
  | "payment_issues";

export interface DashboardPendingAction {
  key: DashboardPendingActionKey;
  label: string;
  description: string;
  count: number;
  /** Oldest unresolved record in the queue, when the queue is not empty. */
  oldestAt: string | null;
  /** Module deep link with the matching filter applied. */
  href: string;
  severity: "high" | "medium" | "low";
}

export interface DashboardActivityItem {
  id: string;
  type: string;
  channel: "marketplace" | "administration";
  title: string;
  description: string | null;
  actorName: string;
  actorRole: string;
  subjectType: string;
  subjectLabel: string | null;
  href: string | null;
  createdAt: string;
}

export interface DashboardOverview {
  range: DashboardRangeDTO;
  metrics: DashboardMetric[];
  charts: DashboardSeries[];
  pendingActions: DashboardPendingAction[];
  recentActivity: DashboardActivityItem[];
  generatedAt: string;
}

export interface DashboardRangeDTO {
  key: DashboardRange["key"];
  label: string;
  start: string;
  end: string;
  granularity: DashboardRange["granularity"];
  timezone: string;
}

export function toRangeDTO(range: DashboardRange): DashboardRangeDTO {
  return {
    key: range.key,
    label: range.label,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    granularity: range.granularity,
    timezone: range.timezone,
  };
}
