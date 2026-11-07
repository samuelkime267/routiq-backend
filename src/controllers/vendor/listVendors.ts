import type { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import { listVendorsQuerySchema } from "@/schemas/vendor";
import {
  loadVendorRollups,
  storeSummary,
} from "@/services/vendors/queries";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listVendors = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      search,
      status,
      storeStatus,
      category,
      sortBy,
      sortOrder,
      page,
      limit,
    } = listVendorsQuerySchema.parse(req.query);

    const query = User.find({ role: "vendor" });

    if (status) query.where("status", status);

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      query.or([{ name: pattern }, { email: pattern }, { username: pattern }]);
    }

    if (storeStatus || category) {
      const storeFilter: Record<string, string> = {};
      if (storeStatus) storeFilter.status = storeStatus;
      if (category) storeFilter.category = category;

      const ownerIds = await Store.distinct("owner", storeFilter);
      query.where("_id").in(ownerIds);
    }

    const sort: Record<string, 1 | -1> =
      sortBy === "createdAt"
        ? { _id: sortOrder === "asc" ? 1 : -1 }
        : { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const skip = (page - 1) * limit;
    const [vendors, total] = await Promise.all([
      query.sort(sort).skip(skip).limit(limit),
      User.countDocuments(query.getFilter()),
    ]);

    const vendorIds = vendors.map((vendor) => String(vendor._id));
    const { storesByVendor, metricsByVendor } =
      await loadVendorRollups(vendorIds);

    res.status(200).json({
      message: "Vendors retrieved successfully",
      success: true,
      data: {
        vendors: vendors.map((vendor) => {
          const id = String(vendor._id);

          return {
            vendor: vendor.toJSON(),
            store: storeSummary(storesByVendor.get(id)),
            metrics: metricsByVendor.get(id) ?? {
              products: 0,
              orders: 0,
              revenue: 0,
            },
          };
        }),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
