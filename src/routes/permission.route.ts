import { Router } from "express";
import { listPermissions } from "@/controllers/admin";
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";

const permissionRouter = Router();

permissionRouter.get(
  "/",
  isAuthenticated,
  requireAdmin,
  requirePermission("roles.manage"),
  listPermissions,
);

export default permissionRouter;
