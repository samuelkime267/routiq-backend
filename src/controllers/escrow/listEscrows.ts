import type { NextFunction, Request, Response } from "express";
import { listEscrowsQuerySchema } from "@/schemas/escrow";
import { queryEscrows } from "@/services/escrow/query";

export const listEscrows = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = listEscrowsQuerySchema.parse(req.query);
    const result = await queryEscrows(query);

    res.status(200).json({
      message: "Escrow records retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
