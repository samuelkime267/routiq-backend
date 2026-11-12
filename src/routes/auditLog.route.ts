import { Router } from "express";
import { getAuditLog, listAuditLogs } from "@/controllers/admin";
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";

const auditLogRouter = Router();

// Read-only by design. No POST/PATCH/DELETE route exists for audit records.
auditLogRouter.use(
  isAuthenticated,
  requireAdmin,
  requirePermission("audit_logs.view"),
);

auditLogRouter.get("/", listAuditLogs);
auditLogRouter.get("/:logId", getAuditLog);

export default auditLogRouter;
