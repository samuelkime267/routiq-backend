import { NextFunction, Request, Response } from "express";
import {
  approveProductSchema,
  rejectProductSchema,
  restoreProductSchema,
  suspendProductSchema,
} from "@/schemas/product";

const parseBody =
  (schema: { parse: (value: unknown) => unknown }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

export const approveProductValidator = parseBody(approveProductSchema);
export const rejectProductValidator = parseBody(rejectProductSchema);
export const suspendProductValidator = parseBody(suspendProductSchema);
export const restoreProductValidator = parseBody(restoreProductSchema);
