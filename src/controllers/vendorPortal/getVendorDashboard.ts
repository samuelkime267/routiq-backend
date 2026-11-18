import type { NextFunction, Request, Response } from "express";
import { vendorFinanceQuerySchema } from "@/schemas/vendorPortal";
import { storeAccessSummary } from "@/services/vendorPortal/access";
import { getVendorDashboard } from "@/services/vendorPortal/finance";
import { vendorContext } from "./context";

export const getVendorDashboardController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const query = vendorFinanceQuerySchema.parse(req.query);
    const dashboard = await getVendorDashboard(
      String(vendor._id),
      {
        id: String(store._id),
        name: store.name,
        slug: store.slug,
        status: store.status,
        category: store.category,
        logo: store.logo ?? null,
        access: storeAccessSummary(store),
      },
      query,
    );

    res.status(200).json({
      message: "Vendor dashboard retrieved successfully",
      success: true,
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
};
