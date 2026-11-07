import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import {
  adminInviteSchema,
  adminLoginSchema,
  adminPermissionsSchema,
  adminRoleSchema,
  adminStatusSchema,
} from "@/schemas/admin";
import { updatePasswordSchema } from "@/schemas/auth";

const parseBody =
  (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

export const adminLoginValidator = parseBody(adminLoginSchema);
export const adminInviteValidator = parseBody(adminInviteSchema);
export const adminRoleValidator = parseBody(adminRoleSchema);
export const adminStatusValidator = parseBody(adminStatusSchema);
export const adminPermissionsValidator = parseBody(adminPermissionsSchema);
export const adminResetPasswordValidator = parseBody(updatePasswordSchema);
