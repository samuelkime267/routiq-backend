import type { NextFunction, Request, Response } from "express";
import { getVendorProduct } from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const getVendorProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const result = await getVendorProduct(
      String(vendor._id),
      String(req.params.productId),
    );

    res.status(200).json({
      message: "Product retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
