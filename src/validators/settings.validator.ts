import type { NextFunction, Request, Response } from "express";
import { updateSettingsSchema } from "@/schemas/settings";

export const updateSettingsValidator = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    req.body = updateSettingsSchema.parse(req.body ?? {});
    next();
  } catch (error) {
    next(error);
  }
};
