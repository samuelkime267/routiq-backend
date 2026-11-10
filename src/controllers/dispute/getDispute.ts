import type { NextFunction, Request, Response } from "express";
import {
  findDisputeOrThrow,
  loadDisputeDetail,
} from "@/services/disputes/query";

export const getDispute = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const dispute = await findDisputeOrThrow(String(req.params.disputeId));
    const detail = await loadDisputeDetail(dispute);

    res.status(200).json({
      message: "Dispute retrieved successfully",
      success: true,
      data: detail,
    });
  } catch (error) {
    next(error);
  }
};
