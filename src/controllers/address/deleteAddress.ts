import type { NextFunction, Request, Response } from "express";
import { deleteCustomerAddress } from "@/services/addresses";

export const deleteAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await deleteCustomerAddress(
      String(req.user!._id),
      String(req.params.addressId),
    );

    res.status(200).json({
      message: "Address deleted successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
