import { UserDocument } from "@/models/user.model";
import { generateJwtToken, refreshTokenCookieOptions } from "@/utils";
import { NextFunction, Request, Response } from "express";

/**
 * Establishes a first-party session on the current API host.
 *
 * Apps live on separate `*.localhost` subdomains in development, and browsers
 * like Brave block third-party cookies, so a refresh cookie set while signing
 * in on auth.localhost cannot be used from vendor.localhost. The auth app
 * redirects with a short-lived access token in the URL fragment; the target
 * app posts it here (same-host API) and receives its own httpOnly cookie.
 */
export const handoffSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user as UserDocument;
    const token = generateJwtToken(user._id);

    res
      .cookie("refreshToken", token.refreshToken, refreshTokenCookieOptions)
      .status(200)
      .json({
        message: "Session created successfully",
        success: true,
        data: { user, token: { accessToken: token.accessToken } },
      });
  } catch (error) {
    next(error);
  }
};
