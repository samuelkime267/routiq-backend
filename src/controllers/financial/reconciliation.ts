import type { NextFunction, Request, Response } from "express";
import { reconciliationQuerySchema } from "@/schemas/financial";
import { getReconciliationReport } from "@/services/financials/query";
import { resolveDashboardRange } from "@/services/dashboard";

export const financialReconciliation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = reconciliationQuerySchema.parse(req.query);
    const range = resolveDashboardRange(query);
    const report = await getReconciliationReport(range, query);

    res.status(200).json({
      message: "Reconciliation report retrieved successfully",
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};
