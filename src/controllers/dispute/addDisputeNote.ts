import type { NextFunction, Request, Response } from "express";
import type { CreateDisputeNoteInput } from "@/schemas/dispute";
import { addDisputeNote, decorateDispute } from "@/services/disputes/query";
import { assertPermission } from "@/utils/adminAccess";

export const addDisputeNoteAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["disputes.manage"]);
    const dispute = await addDisputeNote(
      String(req.params.disputeId),
      admin,
      req.body as CreateDisputeNoteInput,
    );

    res.status(201).json({
      message: "Internal note added successfully",
      success: true,
      data: { dispute: decorateDispute(dispute) },
    });
  } catch (error) {
    next(error);
  }
};
