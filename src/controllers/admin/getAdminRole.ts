import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AdminRoleDefinition from "@/models/adminRoleDefinition.model";
import User from "@/models/user.model";
import { findRoleDefinition } from "@/services/adminRoles";
import { createError } from "@/utils";

export const getAdminRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { roleId } = req.params;

    if (typeof roleId !== "string") {
      throw createError("Role not found", 404);
    }

    const role = await findRoleDefinition(roleId);

    if (!role) throw createError("Role not found", 404);

    const adminCount = await User.countDocuments({
      role: "admin",
      adminRole: role.key,
    });

    res.status(200).json({
      message: "Admin role retrieved successfully",
      success: true,
      data: {
        role: {
          ...role.toObject(),
          adminCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
