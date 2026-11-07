import type { NextFunction, Request, Response } from "express";
import Payment from "@/models/payment.model";
import Store from "@/models/store.model";
import StoreReview from "@/models/storeReview.model";
import User from "@/models/user.model";
import { createError } from "@/utils";
import { loadVendorRollups } from "@/services/vendors/queries";

export const getVendor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const vendor = await User.findOne({
      _id: req.params.vendorId,
      role: "vendor",
    });

    if (!vendor) throw createError("Vendor not found", 404);

    const vendorId = String(vendor._id);
    const [store, rollups, transactionRows] = await Promise.all([
      Store.findOne({ owner: vendor._id }).sort({ createdAt: 1 }),
      loadVendorRollups([vendorId]),
      Payment.aggregate<{ count: number; volume: number }>([
        { $match: { vendor: vendor._id, status: "successful" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            volume: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const history = store
      ? await StoreReview.find({ store: store._id })
          .populate("actor", "name email adminRole")
          .sort({ createdAt: -1 })
          .limit(10)
      : [];

    const metrics = rollups.metricsByVendor.get(vendorId) ?? {
      products: 0,
      orders: 0,
      revenue: 0,
    };

    res.status(200).json({
      message: "Vendor retrieved successfully",
      success: true,
      data: {
        vendor: vendor.toJSON(),
        store,
        history,
        metrics: {
          ...metrics,
          transactions: transactionRows[0]?.count ?? 0,
          transactionVolume: transactionRows[0]?.volume ?? 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
