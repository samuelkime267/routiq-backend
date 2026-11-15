import type { NextFunction, Request, Response } from "express";
import type { CreateAddressInput } from "@/schemas/address";
import {
  createCustomerAddress,
  toAddressView,
} from "@/services/addresses";

export const createAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const address = await createCustomerAddress(
      String(req.user!._id),
      req.body as CreateAddressInput,
    );

    res.status(201).json({
      message: "Address saved successfully",
      success: true,
      data: { address: toAddressView(address) },
    });
  } catch (error) {
    next(error);
  }
};
