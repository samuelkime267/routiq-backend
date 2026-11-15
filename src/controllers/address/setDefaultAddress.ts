import type { NextFunction, Request, Response } from "express";
import {
  setDefaultAddress as setDefaultAddressService,
  toAddressView,
} from "@/services/addresses";

export const setDefaultAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const address = await setDefaultAddressService(
      String(req.user!._id),
      String(req.params.addressId),
    );

    res.status(200).json({
      message: "Default address updated",
      success: true,
      data: { address: toAddressView(address) },
    });
  } catch (error) {
    next(error);
  }
};
