import { NextFunction, Request, Response } from "express";
import { RegisterSchemaType } from "@/schemas/auth";
import User from "@/models/user.model";
import { CustomError } from "@/types";
import { generateJwtToken, refreshTokenCookieOptions } from "@/utils";
import { actorFromUser, recordActivity } from "@/lib/activity";
import bcrypt from "bcryptjs";

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, name, username, password, role } =
      req.body as RegisterSchemaType;
    const normalizedEmail = email.toLowerCase();
    const normalizedUsername = username.toLowerCase();

    const existingUserEmail = await User.findOne({ email: normalizedEmail });
    const existingUserUsername = await User.findOne({
      username: normalizedUsername,
    });

    if (existingUserEmail) {
      const error = new Error() as CustomError;
      error.message = "User with given email already exists";
      error.statusCode = 400;
      throw error;
    }
    if (existingUserUsername) {
      const error = new Error() as CustomError;
      error.message = "User with given username already exists";
      error.statusCode = 400;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: normalizedEmail,
      name,
      username: normalizedUsername,
      password: hashedPassword,
      role,
    });

    const token = generateJwtToken(user._id);

    if (user.role === "vendor") {
      await recordActivity({
        type: "vendor_registered",
        title: "New vendor registered",
        description: `${user.name} joined the marketplace as a vendor.`,
        actor: actorFromUser(user),
        subject: { type: "vendor", id: user._id, label: user.name },
        href: `/vendors?search=${encodeURIComponent(user.email)}`,
      });
    }

    res
      .cookie("refreshToken", token.refreshToken, refreshTokenCookieOptions)
      .status(201)
      .json({
        message: "User created successfully",
        success: true,
        data: { user, token },
      });
  } catch (error) {
    next(error);
  }
};
