import type { NextFunction, Request, Response } from "express";
import { dashboardRangeQuerySchema } from "@/schemas/dashboard";
import {
  getDashboardMetrics,
  resolveDashboardRange,
  toRangeDTO,
} from "@/services/dashboard";

export const dashboardMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = dashboardRangeQuerySchema.parse(req.query);
    const range = resolveDashboardRange(query);
    const metrics = await getDashboardMetrics(range);

    res.status(200).json({
      message: "Dashboard metrics retrieved successfully",
      success: true,
      data: {
        range: toRangeDTO(range),
        metrics,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
