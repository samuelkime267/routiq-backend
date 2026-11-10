import type { NextFunction, Request, Response } from "express";
import { findTransactionOrThrow } from "@/services/transactions/query";

export const getTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await findTransactionOrThrow(
      String(req.params.transactionId),
    );

    res.status(200).json({
      message: "Transaction retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
