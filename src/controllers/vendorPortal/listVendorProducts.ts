import type { NextFunction, Request, Response } from "express";
import { vendorProductListQuerySchema } from "@/schemas/vendorPortal";
import { queryVendorProducts } from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const listVendorProductsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const query = vendorProductListQuerySchema.parse(req.query);
    const result = await queryVendorProducts(
      String(vendor._id),
      String(store._id),
      query,
    );

    res.status(200).json({
      message: "Products retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
