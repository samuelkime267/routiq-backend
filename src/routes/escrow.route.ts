import { Router } from "express";
import { getEscrow, listEscrows } from "@/controllers/escrow";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";

const escrowRouter = Router();

escrowRouter.use(isAuthenticated, requireAdmin);

escrowRouter.get("/", requirePermission("escrow.view"), listEscrows);
escrowRouter.get("/:escrowId", requirePermission("escrow.view"), getEscrow);

export default escrowRouter;
