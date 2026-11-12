import type { NextFunction, Request, Response } from "express";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type Permission,
} from "@/config/permissions";

/**
 * The permission catalogue used by the role editor. Grouping lives on the
 * backend so the frontend never hard-codes the list.
 */
export const listPermissions = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.status(200).json({
      message: "Permissions retrieved successfully",
      success: true,
      data: {
        permissions: PERMISSIONS.map((key: Permission) => ({
          key,
          label: PERMISSION_LABELS[key],
        })),
        groups: Object.entries(PERMISSION_GROUPS).map(([label, keys]) => ({
          label,
          permissions: keys.map((key) => ({
            key,
            label: PERMISSION_LABELS[key],
          })),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
