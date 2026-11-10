import type { NextFunction, Request, Response } from "express";
import { dashboardRangeQuerySchema } from "@/schemas/dashboard";
import { getRevenueReport } from "@/services/financials/query";
import { resolveDashboardRange } from "@/services/dashboard";

export const financialRevenue = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = dashboardRangeQuerySchema.parse(req.query);
    const range = resolveDashboardRange(query);
    const report = await getRevenueReport(range);

    res.status(200).json({
      message: "Revenue report retrieved successfully",
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};
