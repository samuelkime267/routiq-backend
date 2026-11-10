import type { NextFunction, Request, Response } from "express";
import type { ResolveDisputeInput } from "@/schemas/dispute";
import { decorateDispute, resolveDispute } from "@/services/disputes/query";
import { assertPermission } from "@/utils/adminAccess";

export const resolveDisputeAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["disputes.manage"]);
    const dispute = await resolveDispute(
      String(req.params.disputeId),
      admin,
      req.body as ResolveDisputeInput,
    );

    res.status(200).json({
      message: "Dispute resolved successfully",
      success: true,
      data: { dispute: decorateDispute(dispute) },
    });
  } catch (error) {
    next(error);
  }
};
