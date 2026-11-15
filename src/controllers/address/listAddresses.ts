import type { NextFunction, Request, Response } from "express";
import {
  listCustomerAddresses,
  toAddressView,
} from "@/services/addresses";

export const listAddresses = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const addresses = await listCustomerAddresses(String(req.user!._id));

    res.status(200).json({
      message: "Addresses retrieved successfully",
      success: true,
      data: { addresses: addresses.map(toAddressView) },
    });
  } catch (error) {
    next(error);
  }
};
