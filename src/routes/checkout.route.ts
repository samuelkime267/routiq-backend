import { Router } from "express";
import {
  getCheckout,
  placeCheckout,
  quoteCheckout,
} from "@/controllers/checkout";
import { authorizeRoles, isAuthenticated } from "@/middleware";
import {
  checkoutQuoteValidator,
  placeCheckoutValidator,
} from "@/validators/checkout.validator";

const checkoutRouter = Router();

checkoutRouter.use(isAuthenticated, authorizeRoles("user"));

checkoutRouter.post("/quote", checkoutQuoteValidator, quoteCheckout);
checkoutRouter.post("/", placeCheckoutValidator, placeCheckout);
checkoutRouter.get("/:masterOrderNumber", getCheckout);

export default checkoutRouter;
