import type { NextFunction, Request, Response } from "express";
import { dashboardRangeQuerySchema } from "@/schemas/dashboard";
import {
  getDashboardCharts,
  resolveDashboardRange,
  toRangeDTO,
} from "@/services/dashboard";

export const dashboardCharts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = dashboardRangeQuerySchema.parse(req.query);
    const range = resolveDashboardRange(query);
    const series = await getDashboardCharts(range);

    res.status(200).json({
      message: "Dashboard charts retrieved successfully",
      success: true,
      data: {
        range: toRangeDTO(range),
        series,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
