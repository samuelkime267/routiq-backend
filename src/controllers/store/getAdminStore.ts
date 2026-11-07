import type { NextFunction, Request, Response } from "express";
import Product from "@/models/product.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Store from "@/models/store.model";
import StoreReview from "@/models/storeReview.model";
import { getStoreApprovalReadiness } from "@/services/store/workflow";
import { createError } from "@/utils";

export const getAdminStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const store = await Store.findById(req.params.storeId).populate(
      "owner",
      "name email username role status isEmailVerified profilePicture createdAt suspensionReason suspendedAt",
    );

    if (!store) throw createError("Store not found", 404);

    const [history, products, orderRows, paymentRows] = await Promise.all([
      StoreReview.find({ store: store._id })
        .populate("actor", "name email adminRole")
        .sort({ createdAt: -1 })
        .limit(50),
      Product.countDocuments({ store: store._id }),
      Order.aggregate<{ count: number; revenue: number }>([
        {
          $match: {
            store: store._id,
            status: { $nin: ["cancelled", "refunded"] },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: "$total" },
          },
        },
      ]),
      Payment.aggregate<{ count: number; revenue: number }>([
        { $match: { store: store._id, status: "successful" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    res.status(200).json({
      message: "Store retrieved successfully",
      success: true,
      data: {
        store,
        history,
        readiness: getStoreApprovalReadiness(store),
        metrics: {
          products,
          orders: orderRows[0]?.count ?? 0,
          orderRevenue: orderRows[0]?.revenue ?? 0,
          transactions: paymentRows[0]?.count ?? 0,
          transactionVolume: paymentRows[0]?.revenue ?? 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
