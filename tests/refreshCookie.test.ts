import { describe, expect, it } from "vitest";
import {
  clearRefreshTokenCookieOptions,
  refreshTokenCookieOptions,
} from "@/utils/refreshCookie";

describe("refresh cookie options", () => {
  it("keeps the refresh token httpOnly and scoped to auth routes", () => {
    expect(refreshTokenCookieOptions.httpOnly).toBe(true);
    expect(refreshTokenCookieOptions.path).toBe("/api/v1/auth");
  });

  it("stays first-party and same-site with the app host", () => {
    expect(refreshTokenCookieOptions.sameSite).toBe("lax");
  });

  it("only requires Secure in production", () => {
    expect(refreshTokenCookieOptions.secure).toBe(false);
  });

  it("expires the cookie after 30 days", () => {
    expect(refreshTokenCookieOptions.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("does not extend the cookie lifetime when clearing it", () => {
    expect(clearRefreshTokenCookieOptions.maxAge).toBeUndefined();
    expect(clearRefreshTokenCookieOptions.path).toBe("/api/v1/auth");
  });
});
