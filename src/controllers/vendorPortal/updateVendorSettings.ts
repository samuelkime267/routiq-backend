import type { NextFunction, Request, Response } from "express";
import type { UpdateVendorSettingsInput } from "@/schemas/vendorPortal";
import { updateVendorSettings } from "@/services/vendorPortal/settings";
import { vendorContext } from "./context";

export const updateVendorSettingsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const settings = await updateVendorSettings(
      vendor,
      store,
      req.body as UpdateVendorSettingsInput,
    );

    res.status(200).json({
      message: "Settings updated successfully",
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
