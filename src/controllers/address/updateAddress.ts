import type { NextFunction, Request, Response } from "express";
import type { UpdateAddressInput } from "@/schemas/address";
import {
  toAddressView,
  updateCustomerAddress,
} from "@/services/addresses";

export const updateAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const address = await updateCustomerAddress(
      String(req.user!._id),
      String(req.params.addressId),
      req.body as UpdateAddressInput,
    );

    res.status(200).json({
      message: "Address updated successfully",
      success: true,
      data: { address: toAddressView(address) },
    });
  } catch (error) {
    next(error);
  }
};
