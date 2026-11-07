import { Router } from "express";
import {
  register,
  login,
  logout,
  refreshToken,
  handoffSession,
  googleOAuthCallback,
  googleOAuthLogin,
  sendVerificationEmail,
  verifyEmail,
  sendResetPasswordLink,
  resetPassword,
} from "@/controllers/auth";
import {
  loginValidator,
  registerValidator,
  sendResetPasswordLinkValidator,
  updatePasswordValidator,
} from "@/validators/auth.validator";
import {
  adminLoginValidator,
  adminResetPasswordValidator,
} from "@/validators/admin.validator";
import {
  adminLogin,
  adminLogout,
  adminRefresh,
  adminMe,
  adminForgotPassword,
  adminResetPassword,
} from "@/controllers/admin";
import { isValidRefreshToken, isAuthenticated, requireAdmin } from "@/middleware";

const authRouter = Router();

authRouter.post("/register", registerValidator, register);
authRouter.post("/login", loginValidator, login);
authRouter.post("/logout", isAuthenticated, isValidRefreshToken, logout);
authRouter.post("/refresh-token", isValidRefreshToken, refreshToken);
authRouter.post("/handoff", isAuthenticated, handoffSession);
authRouter.get("/google", googleOAuthLogin);
authRouter.get("/google/callback", googleOAuthCallback);
authRouter.post("/verify-email", isAuthenticated, sendVerificationEmail);
authRouter.get("/verify-email/:token", isAuthenticated, verifyEmail);

authRouter.post(
  "/forgot-password",
  sendResetPasswordLinkValidator,
  sendResetPasswordLink,
);
authRouter.post(
  "/reset-password/:token",
  updatePasswordValidator,
  resetPassword,
);

// Administrative authentication. These routes share the JWT/refresh-cookie
// infrastructure, but enforce the admin lifecycle and permissions.
authRouter.post("/admin/login", adminLoginValidator, adminLogin);
authRouter.post(
  "/admin/logout",
  isAuthenticated,
  requireAdmin,
  isValidRefreshToken,
  adminLogout,
);
authRouter.post("/admin/refresh", isValidRefreshToken, requireAdmin, adminRefresh);
authRouter.get("/admin/me", isAuthenticated, requireAdmin, adminMe);
authRouter.post(
  "/admin/forgot-password",
  sendResetPasswordLinkValidator,
  adminForgotPassword,
);
authRouter.post(
  "/admin/reset-password/:token",
  adminResetPasswordValidator,
  adminResetPassword,
);

export default authRouter;
