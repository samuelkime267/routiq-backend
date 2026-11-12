import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import User from "@/models/user.model";
import { createError } from "@/utils";

/**
 * Attaches the current user when a valid access token is supplied, but lets
 * anonymous requests through.
 *
 * Public marketplace routes use this instead of `isAuthenticated` so the same
 * URL can serve a customer-facing response and an administrator response. A
 * token that is present but invalid still fails: silently downgrading an
 * expired admin session to a public response would break the admin console's
 * refresh/expiry handling.
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return next();
    }

    if (!header.startsWith("Bearer")) {
      throw createError("User not authenticated", 401);
    }

    const token = header.split(" ")[1];
    if (!token) throw createError("User not authenticated", 401);

    const decodedData = jwt.verify(token, JWT_SECRET);
    if (
      typeof decodedData === "string" ||
      decodedData.type !== "access" ||
      !decodedData.id
    ) {
      throw createError("User not authenticated", 401);
    }

    const user = await User.findById(decodedData.id);
    if (!user) throw createError("User not authenticated", 401);

    if (user.status && user.status !== "active") {
      throw createError("Account is not active", 403);
    }

    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(createError("User not authenticated", 401));
    }

    next(error);
  }
};
