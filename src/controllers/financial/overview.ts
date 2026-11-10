import type { NextFunction, Request, Response } from "express";
import { dashboardRangeQuerySchema } from "@/schemas/dashboard";
import { getFinancialOverview } from "@/services/financials/query";
import { resolveDashboardRange } from "@/services/dashboard";

export const financialOverview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = dashboardRangeQuerySchema.parse(req.query);
    const range = resolveDashboardRange(query);
    const overview = await getFinancialOverview(range);

    res.status(200).json({
      message: "Financial overview retrieved successfully",
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
};
