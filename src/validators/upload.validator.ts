import { NextFunction, Request, Response } from "express";
import { uploadFileSchema } from "@/schemas/upload";

export const uploadFileValidator = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    req.body = uploadFileSchema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
