import type { NextFunction, Request, Response } from "express";
import {
  deleteVendorProduct,
  findVendorProduct,
} from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const deleteVendorProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const product = await findVendorProduct(
      String(vendor._id),
      String(req.params.productId),
    );
    const result = await deleteVendorProduct(vendor, store, product);

    res.status(200).json({
      message: "Product deleted",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
