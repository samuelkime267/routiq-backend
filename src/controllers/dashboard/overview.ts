import type { NextFunction, Request, Response } from "express";
import { dashboardRangeQuerySchema } from "@/schemas/dashboard";
import {
  getDashboardOverview,
  resolveDashboardRange,
} from "@/services/dashboard";

export const dashboardOverview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = dashboardRangeQuerySchema.parse(req.query);
    const range = resolveDashboardRange(query);
    const overview = await getDashboardOverview(range);

    res.status(200).json({
      message: "Dashboard overview retrieved successfully",
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
};
