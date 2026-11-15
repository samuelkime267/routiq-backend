import { NextFunction, Request, Response } from "express";
import {
  createAddressSchema,
  updateAddressSchema,
} from "@/schemas/address";

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

export const createAddressValidator = parseBody(createAddressSchema);
export const updateAddressValidator = parseBody(updateAddressSchema);
