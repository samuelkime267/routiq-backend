import { NextFunction, Request, Response } from "express";
import { changeUserRoleSchema } from "@/schemas/user";
import { updateUserStatusSchema } from "@/schemas/user";

export const changeUserRoleValidator = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    req.body = changeUserRoleSchema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

export const updateUserStatusValidator = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    req.body = updateUserStatusSchema.parse(req.body ?? {});
    next();
  } catch (error) {
    next(error);
  }
};
