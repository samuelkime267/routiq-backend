import { Router } from "express";
import {
  createAdminRole,
  deleteAdminRole,
  getAdminRole,
  listAdminRoles,
  updateAdminRole,
} from "@/controllers/admin";
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";
import {
  createAdminRoleValidator,
  updateAdminRoleValidator,
} from "@/validators/adminRole.validator";

const adminRoleRouter = Router();

adminRoleRouter.use(
  isAuthenticated,
  requireAdmin,
  requirePermission("roles.manage"),
);

adminRoleRouter.get("/", listAdminRoles);
adminRoleRouter.get("/:roleId", getAdminRole);
adminRoleRouter.post("/", createAdminRoleValidator, createAdminRole);
adminRoleRouter.patch("/:roleId", updateAdminRoleValidator, updateAdminRole);
adminRoleRouter.delete("/:roleId", deleteAdminRole);

export default adminRoleRouter;
