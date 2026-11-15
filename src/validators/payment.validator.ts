import { NextFunction, Request, Response } from "express";
import { retryPaymentSchema } from "@/schemas/payment";

const parseBody =
  (schema: { parse: (value: unknown) => unknown }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };

export const retryPaymentValidator = parseBody(retryPaymentSchema);
