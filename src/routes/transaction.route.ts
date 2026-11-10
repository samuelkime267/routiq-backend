import { Router } from "express";
import {
  getTransaction,
  listTransactions,
} from "@/controllers/transaction";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";

const transactionRouter = Router();

transactionRouter.use(isAuthenticated, requireAdmin);

transactionRouter.get(
  "/",
  requirePermission("transactions.view"),
  listTransactions,
);
transactionRouter.get(
  "/:transactionId",
  requirePermission("transactions.view"),
  getTransaction,
);

export default transactionRouter;
