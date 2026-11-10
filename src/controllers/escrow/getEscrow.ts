import type { NextFunction, Request, Response } from "express";
import {
  findEscrowOrThrow,
  loadEscrowDetail,
} from "@/services/escrow/query";

export const getEscrow = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const escrow = await findEscrowOrThrow(String(req.params.escrowId));
    const detail = await loadEscrowDetail(escrow);

    res.status(200).json({
      message: "Escrow record retrieved successfully",
      success: true,
      data: detail,
    });
  } catch (error) {
    next(error);
  }
};
