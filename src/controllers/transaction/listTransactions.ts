import type { NextFunction, Request, Response } from "express";
import { listTransactionsQuerySchema } from "@/schemas/transaction";
import { queryTransactions } from "@/services/transactions/query";

export const listTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = listTransactionsQuerySchema.parse(req.query);
    const result = await queryTransactions(query);

    res.status(200).json({
      message: "Transactions retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
