import type { NextFunction, Request, Response } from "express";
import type { Permission } from "@/config/permissions";
import { assertActiveAdmin, assertPermission } from "@/utils/adminAccess";

/**
 * Requires an authenticated account whose `role` is admin and whose
 * `adminStatus` is ACTIVE. `isAuthenticated` must run first.
 */
export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    assertActiveAdmin(req.user);

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Requires an active admin with every listed permission. Roles grant
 * permissions through the registry in `config/permissions.ts`; endpoints never
 * compare role names directly.
 */
export const requirePermission =
  (...permissions: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertPermission(req.user, permissions);

      next();
    } catch (error) {
      next(error);
    }
  };
