import type { NextFunction, Request, Response } from "express";
import {
  findVendorProduct,
  setVendorProductPublication,
} from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const setVendorProductPublicationController = async (
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
    const { publish } = req.body as { publish: boolean };
    const updated = await setVendorProductPublication(
      vendor,
      store,
      product,
      publish,
    );

    res.status(200).json({
      message: publish ? "Product published" : "Product unpublished",
      success: true,
      data: { product: updated },
    });
  } catch (error) {
    next(error);
  }
};
