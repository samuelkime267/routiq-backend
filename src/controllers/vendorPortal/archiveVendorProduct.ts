import type { NextFunction, Request, Response } from "express";
import {
  archiveVendorProduct,
  findVendorProduct,
} from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const archiveVendorProductController = async (
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
    const updated = await archiveVendorProduct(vendor, store, product);

    res.status(200).json({
      message: "Product archived",
      success: true,
      data: { product: updated },
    });
  } catch (error) {
    next(error);
  }
};
