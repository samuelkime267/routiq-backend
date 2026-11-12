import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import {
  createAdminRoleSchema,
  updateAdminRoleSchema,
} from "@/schemas/adminRole";

const parseBody =
  (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };

export const createAdminRoleValidator = parseBody(createAdminRoleSchema);
export const updateAdminRoleValidator = parseBody(updateAdminRoleSchema);
