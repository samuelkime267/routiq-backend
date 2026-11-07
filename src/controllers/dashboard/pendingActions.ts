import type { NextFunction, Request, Response } from "express";
import { getPendingActions } from "@/services/dashboard";

export const dashboardPendingActions = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const items = await getPendingActions();

    res.status(200).json({
      message: "Dashboard pending actions retrieved successfully",
      success: true,
      data: {
        items,
        total: items.reduce((sum, item) => sum + item.count, 0),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
