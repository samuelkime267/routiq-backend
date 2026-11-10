import type { NextFunction, Request, Response } from "express";
import { hasPermission } from "@/config/permissions";
import { listUsersQuerySchema } from "@/schemas/user";
import { queryUsers } from "@/services/users/query";

/**
 * Account directory. Customers, vendors and (for administrators who can see
 * them) admin accounts all come from the single `User` collection.
 */
export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const includeAdmins = hasPermission(req.user ?? {}, "admins.view");

    const result = await queryUsers(query, { includeAdmins });

    res.status(200).json({
      message: "Users retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
