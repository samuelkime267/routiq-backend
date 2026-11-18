import type { CookieOptions } from "express";
import { NODE_ENV } from "@/config/env";

const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * The API is called on the same hostname as the app (for example
 * vendor.localhost:2607 from vendor.localhost:3000), so the refresh cookie is
 * always first-party and SameSite=Lax is enough. Production keeps the same
 * shape, with Secure enabled over HTTPS.
 *
 * No `Domain` attribute is set, so every subdomain keeps its own host-only
 * cookie: authentication is per app, and no session is shared between them.
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
