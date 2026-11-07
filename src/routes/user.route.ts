import { getMe, listUsers, changeUserRole } from "@/controllers/user";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import { changeUserRoleValidator } from "@/validators/user.validator";
import { Router } from "express";

const userRouter = Router();

userRouter.get("/me", isAuthenticated, getMe);
userRouter.get(
  "/",
  isAuthenticated,
  requireAdmin,
  requirePermission("users.view"),
  listUsers,
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
