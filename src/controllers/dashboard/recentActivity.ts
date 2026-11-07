import type { NextFunction, Request, Response } from "express";
import { dashboardActivityQuerySchema } from "@/schemas/dashboard";
import {
  getRecentActivity,
  resolveDashboardRange,
  toRangeDTO,
} from "@/services/dashboard";

export const dashboardRecentActivity = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = dashboardActivityQuerySchema.parse(req.query);
    const range = query.range
      ? resolveDashboardRange({
          range: query.range,
          from: query.from,
          to: query.to,
        })
      : undefined;
    const items = await getRecentActivity({
      limit: query.limit,
      range,
    });

    res.status(200).json({
      message: "Dashboard recent activity retrieved successfully",
      success: true,
      data: {
        range: range ? toRangeDTO(range) : null,
        items,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
