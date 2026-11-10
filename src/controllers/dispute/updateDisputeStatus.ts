import type { NextFunction, Request, Response } from "express";
import type { UpdateDisputeStatusInput } from "@/schemas/dispute";
import {
  decorateDispute,
  updateDisputeStatus,
} from "@/services/disputes/query";
import { assertPermission } from "@/utils/adminAccess";

export const updateDisputeStatusAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["disputes.manage"]);
    const dispute = await updateDisputeStatus(
      String(req.params.disputeId),
      admin,
      req.body as UpdateDisputeStatusInput,
    );

    res.status(200).json({
      message: "Dispute status updated successfully",
      success: true,
      data: { dispute: decorateDispute(dispute) },
    });
  } catch (error) {
    next(error);
  }
};
