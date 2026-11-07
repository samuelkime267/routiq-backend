import { Request, Response, NextFunction } from "express";
import { CustomError } from "@/types";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import User from "@/models/user.model";
import Token from "@/models/token.model";

export const isValidRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }

    const decodedData = jwt.verify(refreshToken, JWT_SECRET);
    if (
      typeof decodedData === "string" ||
      decodedData.type !== "refresh" ||
      !decodedData.id ||
      !decodedData.exp
    ) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }

    const expiryDate = new Date(decodedData.exp * 1000);
    req.tokenExpiryDate = expiryDate;

    const bannedToken = await Token.findOne({ refreshToken });
    if (bannedToken) {
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
    if (req.user && req.user._id.toString() !== user._id.toString()) {
      const error = new Error("User not authorized") as CustomError;
      error.statusCode = 400;
      throw error;
    }

    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      const error = new Error("Invalid or expired token") as CustomError;
      error.statusCode = 401;
      return next(error);
    }

    next(error);
  }
};
