import type { NextFunction, Request, Response } from "express";
import {
  findVendorProduct,
  submitVendorProduct,
} from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const submitVendorProductController = async (
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
    const updated = await submitVendorProduct(vendor, store, product);

    res.status(200).json({
      message: "Product submitted for review",
      success: true,
      data: { product: updated },
    });
  } catch (error) {
    next(error);
  }
};
