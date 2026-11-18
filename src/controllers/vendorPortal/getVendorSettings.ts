import type { NextFunction, Request, Response } from "express";
import { vendorSettingsSnapshot } from "@/services/vendorPortal/settings";
import { vendorContext } from "./context";

export const getVendorSettingsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);

    res.status(200).json({
      message: "Vendor profile retrieved successfully",
      success: true,
      data: vendorSettingsSnapshot(vendor, store),
    });
  } catch (error) {
    next(error);
  }
};
