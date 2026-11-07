import User from "@/models/user.model";
import Order, { GMV_ORDER_STATUSES } from "@/models/order.model";
import Payment from "@/models/payment.model";
import Store from "@/models/store.model";
import {
  bucketFormat,
  bucketKey,
  bucketLabel,
  rangeBuckets,
  type DashboardRange,
} from "./range";
import type { DashboardPoint, DashboardSeries } from "./types";

interface BucketRow {
  _id: string;
  value: number;
}

const SERIES_DEFINITIONS = {
  orders: {
    label: "Orders over time",
    description: "Orders placed in each period.",
    kind: "count",
  },
  salesVolume: {
    label: "Sales volume",
    description:
      "Value of orders placed, excluding cancelled and refunded orders.",
    kind: "currency",
  },
  marketplaceRevenue: {
    label: "Marketplace revenue",
    description: "Commission recognised on successful payments.",
    kind: "currency",
  },
  vendorRegistrations: {
    label: "Vendor registrations",
    description: "New vendor accounts created.",
    kind: "count",
  },
  storeApprovals: {
    label: "Store approvals",
    description: "Stores approved after review.",
    kind: "count",
  },
} as const;

/**
 * Projects aggregation rows onto every bucket in the range, so the chart has a
 * continuous axis (including zero-value periods) without post-processing gaps
 * in the browser.
 */
function toPoints(
  range: DashboardRange,
  rows: BucketRow[],
): DashboardPoint[] {
  const values = new Map(rows.map((row) => [row._id, row.value]));

  return rangeBuckets(range).map((date) => {
    const key = bucketKey(date, range.granularity);

    return {
      key,
      label: bucketLabel(key, range.granularity),
      value: values.get(key) ?? 0,
    };
  });
}

function series(
  key: keyof typeof SERIES_DEFINITIONS,
  points: DashboardPoint[],
): DashboardSeries {
  const definition = SERIES_DEFINITIONS[key];

  return {
    key,
    label: definition.label,
    description: definition.description,
    kind: definition.kind,
    total: points.reduce((sum, point) => sum + point.value, 0),
    points,
  };
}

/** Time series for the dashboard charts, bucketed in the business timezone. */
export async function getDashboardCharts(
  range: DashboardRange,
): Promise<DashboardSeries[]> {
  const format = bucketFormat(range.granularity);
  const bucket = (field: string) => ({
    $dateToString: {
      date: field,
      format,
      timezone: range.timezone,
    },
  });
  const window = { $gte: range.start, $lt: range.end };

  const [orderSeries, revenue, vendorRegistrations, storeApprovals] =
    await Promise.all([
      Order.aggregate<{ orders: BucketRow[]; sales: BucketRow[] }>([
        { $match: { createdAt: window } },
        {
          $facet: {
            orders: [
              {
                $group: {
                  _id: bucket("$createdAt"),
                  value: { $sum: 1 },
                },
              },
            ],
            sales: [
              { $match: { status: { $in: [...GMV_ORDER_STATUSES] } } },
              {
                $group: {
                  _id: bucket("$createdAt"),
                  value: { $sum: "$total" },
                },
              },
            ],
          },
        },
      ]),
      Payment.aggregate<BucketRow>([
        { $match: { status: "successful", paidAt: window } },
        {
          $group: {
            _id: bucket("$paidAt"),
            value: { $sum: "$platformFee" },
          },
        },
      ]),
      User.aggregate<BucketRow>([
        { $match: { role: "vendor", createdAt: window } },
        {
          $group: {
            _id: bucket("$createdAt"),
            value: { $sum: 1 },
          },
        },
      ]),
      Store.aggregate<BucketRow>([
        { $match: { status: "approved", reviewedAt: window } },
        {
          $group: {
            _id: bucket("$reviewedAt"),
            value: { $sum: 1 },
          },
        },
      ]),
    ]);

  return [
    series("orders", toPoints(range, orderSeries[0]?.orders ?? [])),
    series("salesVolume", toPoints(range, orderSeries[0]?.sales ?? [])),
    series("marketplaceRevenue", toPoints(range, revenue)),
    series(
      "vendorRegistrations",
      toPoints(range, vendorRegistrations),
    ),
    series("storeApprovals", toPoints(range, storeApprovals)),
  ];
}
