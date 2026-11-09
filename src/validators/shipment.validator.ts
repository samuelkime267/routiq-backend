import { NextFunction, Request, Response } from "express";
import { cancelShipmentSchema } from "@/schemas/shipment";

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

export const cancelShipmentValidator = parseBody(cancelShipmentSchema);
