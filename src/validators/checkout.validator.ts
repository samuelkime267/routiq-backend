import { NextFunction, Request, Response } from "express";
import { checkoutQuoteSchema, placeCheckoutSchema } from "@/schemas/checkout";

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

export const checkoutQuoteValidator = parseBody(checkoutQuoteSchema);
export const placeCheckoutValidator = parseBody(placeCheckoutSchema);
