import type { NextFunction, Request, Response } from "express";
import AdminRoleDefinition from "@/models/adminRoleDefinition.model";
import User from "@/models/user.model";
import { listAdminRolesQuerySchema } from "@/schemas/adminRole";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listAdminRoles = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { search, system, sortBy, sortOrder, page, limit } =
      listAdminRolesQuerySchema.parse(req.query);

    const filter: Record<string, unknown> = {};

    if (system !== undefined) filter.system = system;

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      filter.$or = [
        { key: pattern },
        { label: pattern },
        { description: pattern },
      ];
    }

    const skip = (page - 1) * limit;

    const [roles, total, counts] = await Promise.all([
      AdminRoleDefinition.find(filter)
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminRoleDefinition.countDocuments(filter),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { role: "admin", adminRole: { $ne: null } } },
        { $group: { _id: "$adminRole", count: { $sum: 1 } } },
      ]),
    ]);

    const adminCounts = new Map(
      counts.map((row) => [row._id, row.count]),
    );

    const summary = {
      total,
      system: roles.filter((role) => role.system).length,
      custom: roles.filter((role) => !role.system).length,
    };

    res.status(200).json({
      message: "Admin roles retrieved successfully",
      success: true,
      data: {
        roles: roles.map((role) => ({
          ...role,
          adminCount: adminCounts.get(role.key) ?? 0,
        })),
        summary,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
