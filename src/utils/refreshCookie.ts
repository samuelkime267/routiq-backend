import type { CookieOptions } from "express";
import { NODE_ENV } from "@/config/env";

const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * The API is called on the same hostname as the app (for example
 * vendor.localhost:2607 from vendor.localhost:3000), so the refresh cookie is
 * always first-party and SameSite=Lax is enough. Production keeps the same
 * shape, with Secure enabled over HTTPS.
 *
 * Cross-subdomain sessions are established through `POST /auth/handoff`
 * instead of a shared cookie: Chromium rejects `Domain=localhost`, and
 * browsers that block third-party cookies reject a cookie set on another
 * subdomain.
 */
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
};

export const refreshTokenCookieOptions: CookieOptions = {
  ...baseOptions,
  maxAge: REFRESH_COOKIE_MAX_AGE,
};

export const clearRefreshTokenCookieOptions: CookieOptions = {
  ...baseOptions,
};
