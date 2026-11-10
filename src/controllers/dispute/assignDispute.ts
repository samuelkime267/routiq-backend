import type { NextFunction, Request, Response } from "express";
import type { AssignDisputeInput } from "@/schemas/dispute";
import { assignDispute, decorateDispute } from "@/services/disputes/query";
import { assertPermission } from "@/utils/adminAccess";

export const assignDisputeAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["disputes.manage"]);
    const dispute = await assignDispute(
      String(req.params.disputeId),
      admin,
      req.body as AssignDisputeInput,
    );

    res.status(200).json({
      message: "Dispute assigned successfully",
      success: true,
      data: { dispute: decorateDispute(dispute) },
    });
  } catch (error) {
    next(error);
  }
};
