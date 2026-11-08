import type { NextFunction, Request, Response } from "express";
import Product from "@/models/product.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";

/**
 * Filter options derived from the products that actually exist, so the
 * directory never loads every vendor and store account into the browser.
 */
export const listProductFilters = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const [categories, vendorIds, storeIds] = await Promise.all([
      Product.distinct("category"),
      Product.distinct("vendor"),
      Product.distinct("store"),
    ]);

    const [vendors, stores] = await Promise.all([
      User.find({ _id: { $in: vendorIds } })
        .select("name email")
        .sort({ name: 1 }),
      Store.find({ _id: { $in: storeIds } })
        .select("name owner category")
        .sort({ name: 1 }),
    ]);

    res.status(200).json({
      message: "Product filters retrieved successfully",
      success: true,
      data: {
        categories: categories
          .filter((category): category is string => Boolean(category))
          .sort((left, right) => left.localeCompare(right)),
        vendors: vendors.map((vendor) => ({
          value: String(vendor._id),
          label: vendor.name,
          email: vendor.email,
        })),
        stores: stores.map((store) => ({
          value: String(store._id),
          label: store.name,
          vendor: store.owner ? String(store.owner) : null,
          category: store.category,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
