import type { NextFunction, Request, Response } from "express";
import {
  findVendorProduct,
  updateVendorProductStock,
} from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const updateVendorProductStockController = async (
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
    const updated = await updateVendorProductStock(
      vendor,
      store,
      product,
      req.body as { stock?: number; delta?: number },
    );

    res.status(200).json({
      message: "Stock updated successfully",
      success: true,
      data: { product: updated },
    });
  } catch (error) {
    next(error);
  }
};
