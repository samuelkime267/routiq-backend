import type { NextFunction, Request, Response } from "express";
import {
  createVendorNoteSchema,
  vendorStatusSchema,
} from "@/schemas/vendor";

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

export const vendorStatusValidator = parseBody(vendorStatusSchema);
export const createVendorNoteValidator = parseBody(createVendorNoteSchema);
