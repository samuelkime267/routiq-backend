import { NextFunction, Request, Response } from "express";
import {
  approveStoreSchema,
  createStoreSchema,
  reactivateStoreSchema,
  rejectStoreSchema,
  requestStoreInformationSchema,
  reviewStoreSchema,
  suspendStoreSchema,
  updateStoreSchema,
} from "@/schemas/store";

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

export const createStoreValidator = parseBody(createStoreSchema);
export const updateStoreValidator = parseBody(updateStoreSchema);
export const reviewStoreValidator = parseBody(reviewStoreSchema);
export const approveStoreValidator = parseBody(approveStoreSchema);
export const rejectStoreValidator = parseBody(rejectStoreSchema);
export const requestStoreInformationValidator = parseBody(
  requestStoreInformationSchema,
);
export const suspendStoreValidator = parseBody(suspendStoreSchema);
export const reactivateStoreValidator = parseBody(reactivateStoreSchema);
