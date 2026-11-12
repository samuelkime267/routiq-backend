import { NextFunction, Request, Response } from "express";
import Store, { STORE_STATUSES } from "@/models/store.model";
import { publicStoreQuerySchema } from "@/schemas/marketplace";
import { listStoresQuerySchema } from "@/schemas/store";
import { queryPublicStores } from "@/services/marketplace/stores";
import { assertPermission, isActiveAdmin } from "@/utils";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listStores = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Administrators keep the moderation console contract. Public callers get
    // only approved stores owned by active vendors.
    if (isActiveAdmin(req.user)) {
      assertPermission(req.user, ["stores.view"] as const);
    } else {
      const query = publicStoreQuerySchema.parse(req.query);
      const result = await queryPublicStores(query);

      res.status(200).json({
        message: "Stores retrieved successfully",
        success: true,
        data: result,
      });
      return;
    }

    const { status, search, category, sortBy, sortOrder, page, limit } =
      listStoresQuerySchema.parse(req.query);

    const query = Store.find();

    if (status) query.where("status", status);
    if (category) query.where("category", category);

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      query.or([
        { name: pattern },
        { legalBusinessName: pattern },
        { email: pattern },
        { slug: pattern },
      ]);
    }

    const skip = (page - 1) * limit;

    const [stores, total, statusRows] = await Promise.all([
      query
        .clone()
        .populate("owner", "name email username status profilePicture")
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limit),
      Store.countDocuments(query.getFilter()),
      Store.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const summary = STORE_STATUSES.reduce<Record<string, number>>(
      (accumulator, storeStatus) => {
        accumulator[storeStatus] = 0;
        return accumulator;
      },
      {},
    );

    for (const row of statusRows) {
      if (row._id in summary) summary[row._id] = row.count;
    }

    res.status(200).json({
      message: "Stores retrieved successfully",
      success: true,
      data: {
        stores,
        summary,
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
