import { getDashboardCharts } from "./charts";
import { getDashboardMetrics } from "./metrics";
import { getPendingActions } from "./pendingActions";
import { getRecentActivity } from "./recentActivity";
import { toRangeDTO, type DashboardOverview } from "./types";
import type { DashboardRange } from "./range";

/**
 * Single bootstrap payload for the dashboard page.
 *
 * The four sections are independent, so they load concurrently; the granular
 * endpoints remain available for refreshing one section at a time.
 */
export async function getDashboardOverview(
  range: DashboardRange,
): Promise<DashboardOverview> {
  const [metrics, charts, pendingActions, recentActivity] = await Promise.all([
    getDashboardMetrics(range),
    getDashboardCharts(range),
    getPendingActions(),
    getRecentActivity({ limit: 12 }),
  ]);

  return {
    range: toRangeDTO(range),
    metrics,
    charts,
    pendingActions,
    recentActivity,
    generatedAt: new Date().toISOString(),
  };
}
