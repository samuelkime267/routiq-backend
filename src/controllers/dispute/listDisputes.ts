import type { NextFunction, Request, Response } from "express";
import { listDisputesQuerySchema } from "@/schemas/dispute";
import { queryDisputes } from "@/services/disputes/query";

export const listDisputes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = listDisputesQuerySchema.parse(req.query);
    const result = await queryDisputes(query, String(req.user?._id));

    res.status(200).json({
      message: "Disputes retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
