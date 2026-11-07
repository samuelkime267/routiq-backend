import { sendMail } from "@/lib/mail/mailer";
import { emailVerificationTemplate } from "@/lib/mail/template";
import { UserDocument } from "@/models/user.model";
import { CustomError } from "@/types/customError";
import { generateOtp } from "@/utils";
import { NextFunction, Request, Response } from "express";

export const sendVerificationEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user as UserDocument;
    const { otpLastSentAt } = user;

    if (user.isEmailVerified) {
      const error = new Error() as CustomError;
      error.message = "Email is already verified.";
      error.statusCode = 400;
      throw error;
    }

    const now = new Date();

    if (
      otpLastSentAt &&
      otpLastSentAt > new Date(now.getTime() - 1 * 60 * 1000)
    ) {
      const error = new Error() as CustomError;
      error.message = "You can only request a new OTP once every minute.";
      error.statusCode = 429;
      throw error;
    }

    if (
      otpLastSentAt &&
      otpLastSentAt < new Date(now.getTime() - 15 * 60 * 1000)
    ) {
      user.otpAttempts = 0;
    }

    if (user.otpAttempts >= 5) {
      const error = new Error() as CustomError;
      error.message = "Too many OTP requests. Please try again later.";
      error.statusCode = 429;
      throw error;
    }

    const { otp, hashedOtp, expiresAt } = generateOtp();

    user.emailVerificationToken = hashedOtp;
    user.emailVerificationTokenExpiryDate = expiresAt;
    user.otpAttempts = user.otpAttempts + 1;
    user.otpLastSentAt = now;

    await user.save();

    const { html, text } = emailVerificationTemplate(otp);

    await sendMail({
      to: user.email,
      subject: "Verify your Routiq email",
      html,
      text,
    });

    res.status(200).json({
      message: "Verification email sent successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};
