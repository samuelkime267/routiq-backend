import { NextFunction, Request, Response } from "express";
import {
  adminWithdrawalDecisionSchema,
  cancelWithdrawalSchema,
  createBankAccountSchema,
  createVendorProductSchema,
  createWithdrawalSchema,
  updateBankAccountSchema,
  updateVendorProductSchema,
  updateVendorSettingsSchema,
  updateVendorStockSchema,
  vendorOrderStatusSchema,
  vendorProductPublicationSchema,
  vendorShipOrderSchema,
  verifyBankAccountSchema,
} from "@/schemas/vendorPortal";

const parseBody =
  (schema: { parse: (value: unknown) => unknown }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

export const createVendorProductValidator = parseBody(
  createVendorProductSchema,
);
export const updateVendorProductValidator = parseBody(
  updateVendorProductSchema,
);
export const updateVendorStockValidator = parseBody(updateVendorStockSchema);
export const setVendorProductPublicationValidator = parseBody(
  vendorProductPublicationSchema,
);
export const vendorOrderStatusValidator = parseBody(vendorOrderStatusSchema);
export const vendorShipOrderValidator = parseBody(vendorShipOrderSchema);
export const createWithdrawalValidator = parseBody(createWithdrawalSchema);
export const cancelWithdrawalValidator = parseBody(cancelWithdrawalSchema);
export const createBankAccountValidator = parseBody(createBankAccountSchema);
export const updateBankAccountValidator = parseBody(updateBankAccountSchema);
export const verifyBankAccountValidator = parseBody(verifyBankAccountSchema);
export const updateVendorSettingsValidator = parseBody(
  updateVendorSettingsSchema,
);
export const adminWithdrawalDecisionValidator = parseBody(
  adminWithdrawalDecisionSchema,
);
