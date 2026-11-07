import { NextFunction, Request, Response } from "express";
import { LoginSchemaType } from "@/schemas/auth";
import User from "@/models/user.model";
import { CustomError } from "@/types";
import { generateJwtToken, refreshTokenCookieOptions } from "@/utils";
import bcrypt from "bcryptjs";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body as LoginSchemaType;
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    }).select("+password");
    if (!existingUser) {
      const error = new Error() as CustomError;
      error.message = "User does not exist";
      error.statusCode = 400;
      throw error;
    }
    if (existingUser.role === "admin") {
      const error = new Error() as CustomError;
      error.message = "Administrators must sign in through the admin console";
      error.statusCode = 403;
      throw error;
    }
    if (!existingUser.password || existingUser.authProvider !== "local") {
      const error = new Error() as CustomError;
      error.message = `Login using provider used previously: ${existingUser.authProvider}`;
      error.statusCode = 400;
      throw error;
    }
    if (existingUser.status && existingUser.status !== "active") {
      const error = new Error() as CustomError;
      error.message = "Account is not active";
      error.statusCode = 403;
      throw error;
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingUser.password,
    );
    if (!isPasswordCorrect) {
      const error = new Error() as CustomError;
      error.message = "Invalid credentials";
      error.statusCode = 400;
      throw error;
    }

    const token = generateJwtToken(existingUser._id);

    res
      .cookie("refreshToken", token.refreshToken, refreshTokenCookieOptions)
      .status(200)
      .json({
        message: "User logged in successfully",
        success: true,
        data: { user: existingUser, token },
      });
  } catch (error) {
    next(error);
  }
};
