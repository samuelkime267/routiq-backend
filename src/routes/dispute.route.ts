import { Router } from "express";
import {
  addDisputeNoteAdmin,
  assignDisputeAdmin,
  getDispute,
  listDisputes,
  resolveDisputeAdmin,
  updateDisputeStatusAdmin,
} from "@/controllers/dispute";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  assignDisputeValidator,
  createDisputeNoteValidator,
  resolveDisputeValidator,
  updateDisputeStatusValidator,
} from "@/validators/dispute.validator";

const disputeRouter = Router();

disputeRouter.use(isAuthenticated, requireAdmin);

disputeRouter.get("/", requirePermission("disputes.view"), listDisputes);
disputeRouter.get(
  "/:disputeId",
  requirePermission("disputes.view"),
  getDispute,
);

disputeRouter.post(
  "/:disputeId/admin/assign",
  requirePermission("disputes.manage"),
  assignDisputeValidator,
  assignDisputeAdmin,
);
disputeRouter.patch(
  "/:disputeId/admin/status",
  requirePermission("disputes.manage"),
  updateDisputeStatusValidator,
  updateDisputeStatusAdmin,
);
disputeRouter.post(
  "/:disputeId/admin/notes",
  requirePermission("disputes.manage"),
  createDisputeNoteValidator,
  addDisputeNoteAdmin,
);
disputeRouter.post(
  "/:disputeId/admin/resolve",
  requirePermission("disputes.manage"),
  resolveDisputeValidator,
  resolveDisputeAdmin,
);

export default disputeRouter;
