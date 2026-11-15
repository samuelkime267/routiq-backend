import { Router } from "express";
import {
  listPaymentMethods,
  paymentWebhook,
  retryPayment,
  verifyPayment,
} from "@/controllers/payment";
import { authorizeRoles, isAuthenticated } from "@/middleware";
import { retryPaymentValidator } from "@/validators/payment.validator";

const paymentRouter = Router();

// Provider callback: authenticated by its HMAC signature, not a session.
paymentRouter.post("/webhook", paymentWebhook);

paymentRouter.get("/methods", listPaymentMethods);

paymentRouter.post(
  "/verify/:masterOrderNumber",
  isAuthenticated,
  authorizeRoles("user"),
  verifyPayment,
);
paymentRouter.post(
  "/retry/:masterOrderNumber",
  isAuthenticated,
  authorizeRoles("user"),
  retryPaymentValidator,
  retryPayment,
);

export default paymentRouter;
