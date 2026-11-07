import mongoose from "mongoose";
import Order from "@/models/order.model";
import Product from "@/models/product.model";
import Store from "@/models/store.model";
import type { StoreDocument } from "@/models/store.model";

export interface VendorMetrics {
  products: number;
  orders: number;
  revenue: number;
}

interface VendorMetricRow {
  _id: mongoose.Types.ObjectId;
  count: number;
  revenue?: number;
}

const emptyMetrics = (): VendorMetrics => ({
  products: 0,
  orders: 0,
  revenue: 0,
});

const toObjectId = (value: string) => new mongoose.Types.ObjectId(value);

const toIdString = (value: unknown) => String(value);

/**
 * Loads the store, product and order rollups for a page of vendors in a
 * constant number of queries.
 */
export async function loadVendorRollups(vendorIds: string[]) {
  const storesByVendor = new Map<string, StoreDocument>();
  const metricsByVendor = new Map<string, VendorMetrics>();

  if (vendorIds.length === 0) {
    return { storesByVendor, metricsByVendor };
  }

  const objectIds = vendorIds.map(toObjectId);

  const [stores, productRows, orderRows] = await Promise.all([
    Store.find({ owner: { $in: objectIds } }).sort({ createdAt: 1 }),
    Product.aggregate<VendorMetricRow>([
      { $match: { vendor: { $in: objectIds } } },
      { $group: { _id: "$vendor", count: { $sum: 1 } } },
    ]),
    Order.aggregate<VendorMetricRow>([
      {
        $match: {
          vendor: { $in: objectIds },
          status: { $nin: ["cancelled", "refunded"] },
        },
      },
      {
        $group: {
          _id: "$vendor",
          count: { $sum: 1 },
          revenue: { $sum: "$total" },
        },
      },
    ]),
  ]);

  // One store per vendor is the supported model; keep the oldest if legacy
  // data somehow contains more than one.
  for (const store of stores) {
    const owner = toIdString(store.owner);
    if (!storesByVendor.has(owner)) storesByVendor.set(owner, store);
  }

  for (const id of vendorIds) {
    metricsByVendor.set(id, emptyMetrics());
  }

  for (const row of productRows) {
    const key = toIdString(row._id);
    const metrics = metricsByVendor.get(key) ?? emptyMetrics();
    metrics.products = row.count;
    metricsByVendor.set(key, metrics);
  }

  for (const row of orderRows) {
    const key = toIdString(row._id);
    const metrics = metricsByVendor.get(key) ?? emptyMetrics();
    metrics.orders = row.count;
    metrics.revenue = row.revenue ?? 0;
    metricsByVendor.set(key, metrics);
  }

  return { storesByVendor, metricsByVendor };
}

export function storeSummary(store: StoreDocument | undefined | null) {
  if (!store) return null;

  return {
    _id: String(store._id),
    name: store.name,
    slug: store.slug,
    status: store.status,
    category: store.category,
    businessType: store.businessType,
    logo: store.logo ?? null,
    submittedAt: store.submittedAt ?? null,
    reviewedAt: store.reviewedAt ?? null,
  };
}
