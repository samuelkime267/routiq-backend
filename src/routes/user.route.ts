import { Router } from "express";
import {
  changeUserRole,
  getMe,
  getUser,
  listUserOrders,
  listUsers,
  listUserTransactions,
  updateUserStatus,
} from "@/controllers/user";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  changeUserRoleValidator,
  updateUserStatusValidator,
} from "@/validators/user.validator";

const userRouter = Router();

userRouter.get("/me", isAuthenticated, getMe);

userRouter.get(
  "/",
  isAuthenticated,
  requireAdmin,
  requirePermission("users.view"),
  listUsers,
);
userRouter.get(
  "/:userId",
  isAuthenticated,
  requireAdmin,
  requirePermission("users.view"),
  getUser,
);
userRouter.get(
  "/:userId/orders",
  isAuthenticated,
  requireAdmin,
  requirePermission("users.view"),
  listUserOrders,
);
userRouter.get(
  "/:userId/transactions",
  isAuthenticated,
  requireAdmin,
  requirePermission("users.view"),
  listUserTransactions,
);
userRouter.patch(
  "/:userId/admin/status",
  isAuthenticated,
  requireAdmin,
  requirePermission("users.manage"),
  updateUserStatusValidator,
  updateUserStatus,
);
userRouter.patch(
  "/:id/role",
  isAuthenticated,
  requireAdmin,
  requirePermission("roles.manage"),
  changeUserRoleValidator,
  changeUserRole,
);

export default userRouter;
