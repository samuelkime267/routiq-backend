import type { NextFunction, Request, Response } from "express";
import type { CreateVendorProductInput } from "@/schemas/vendorPortal";
import { createVendorProduct } from "@/services/vendorPortal/products";
import { vendorContext } from "./context";

export const createVendorProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const product = await createVendorProduct(
      vendor,
      store,
      req.body as CreateVendorProductInput,
    );

    res.status(201).json({
      message: "Product draft created successfully",
      success: true,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};
