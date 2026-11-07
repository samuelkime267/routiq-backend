import { NextFunction, Request, Response } from "express";
import { CustomError } from "@/types";
import { UserRole } from "@/models/user.model";

export const authorizeRoles =
  (...allowedRoles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;

      return next(error);
    }

    const role = (req.user.role || "user") as UserRole;

    if (!allowedRoles.includes(role)) {
      const error = new Error(
        "You do not have permission to perform this action",
      ) as CustomError;
      error.statusCode = 403;

      return next(error);
    }

    // Administrative access on shared vendor/admin endpoints also requires a
    // live admin lifecycle, not just role === "admin".
    if (
      role === "admin" &&
      (!req.user.adminRole || req.user.adminStatus !== "ACTIVE")
    ) {
      const error = new Error("Admin account is not active") as CustomError;
      error.statusCode = 403;

      return next(error);
    }

    next();
  };
