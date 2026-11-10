import type { NextFunction, Request, Response } from "express";
import { userTransactionsQuerySchema } from "@/schemas/user";
import {
  findUserOrThrow,
  queryUserTransactions,
} from "@/services/users/query";

export const listUserTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = userTransactionsQuerySchema.parse(req.query);
    const user = await findUserOrThrow(String(req.params.userId));
    const result = await queryUserTransactions(user, query);

    res.status(200).json({
      message: "User transactions retrieved successfully",
      success: true,
      data: {
        ...result,
        transactions: result.transactions.map((transaction) => ({
          ...transaction,
          transactionType:
            (transaction as { status?: string }).status === "refunded"
              ? "refund"
              : "payment",
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
