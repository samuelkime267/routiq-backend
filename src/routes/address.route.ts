import { Router } from "express";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from "@/controllers/address";
import { authorizeRoles, isAuthenticated } from "@/middleware";
import {
  createAddressValidator,
  updateAddressValidator,
} from "@/validators/address.validator";

const addressRouter = Router();

addressRouter.use(isAuthenticated, authorizeRoles("user"));

addressRouter.get("/", listAddresses);
addressRouter.post("/", createAddressValidator, createAddress);
addressRouter.patch("/:addressId", updateAddressValidator, updateAddress);
addressRouter.delete("/:addressId", deleteAddress);
addressRouter.post("/:addressId/default", setDefaultAddress);

export default addressRouter;
