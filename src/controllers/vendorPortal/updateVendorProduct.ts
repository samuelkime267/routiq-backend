import type { NextFunction, Request, Response } from "express";
import type { UpdateVendorProductInput } from "@/schemas/vendorPortal";
import {
  findVendorProduct,
  updateVendorProduct,
} from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const updateVendorProductController = async (
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
    const updated = await updateVendorProduct(
      vendor,
      store,
      product,
      req.body as UpdateVendorProductInput,
    );

    res.status(200).json({
      message: "Product updated successfully",
      success: true,
      data: { product: updated },
    });
  } catch (error) {
    next(error);
  }
};
