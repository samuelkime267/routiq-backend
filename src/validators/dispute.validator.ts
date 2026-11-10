import type { NextFunction, Request, Response } from "express";
import {
  assignDisputeSchema,
  createDisputeNoteSchema,
  resolveDisputeSchema,
  updateDisputeStatusSchema,
} from "@/schemas/dispute";

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

export const assignDisputeValidator = parseBody(assignDisputeSchema);
export const updateDisputeStatusValidator = parseBody(
  updateDisputeStatusSchema,
);
export const createDisputeNoteValidator = parseBody(createDisputeNoteSchema);
export const resolveDisputeValidator = parseBody(resolveDisputeSchema);
