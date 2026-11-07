import { Request, Response, NextFunction } from "express";
import { CustomError } from "../types";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env";
import User from "../models/user.model";

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.headers.authorization) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }

    const token = req.headers.authorization.split(" ")[1];

    if (!req.headers.authorization.startsWith("Bearer") || !token) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }

    const decodedData = jwt.verify(token, JWT_SECRET);
    if (
      typeof decodedData === "string" ||
      decodedData.type !== "access" ||
      !decodedData.id
    ) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findById(decodedData.id);
    if (!user) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }
    if (user.status && user.status !== "active") {
      const error = new Error("Account is not active") as CustomError;
      error.statusCode = 403;
      throw error;
    }

    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      return next(error);
    }

    next(error);
  }
};
