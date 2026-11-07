import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { permissionsForAdmin } from "@/config/permissions";
import User from "@/models/user.model";
import { listAdminsQuerySchema } from "@/schemas/admin";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const adminList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role, status, search, sortBy, sortOrder, page, limit } =
      listAdminsQuerySchema.parse(req.query);

    // Only administrators are ever returned, regardless of the filters.
    const query = User.find({ role: "admin" });

    if (role) query.where("adminRole", role);
    if (status) query.where("adminStatus", status);

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      query.or([{ name: pattern }, { email: pattern }]);
    }

    const sort: Record<string, 1 | -1> =
      // Legacy user documents predate schema timestamps. ObjectId creation
      // order is the reliable fallback for the "Created" sort.
      sortBy === "createdAt"
        ? { _id: sortOrder === "asc" ? 1 : -1 }
        : { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [admins, total] = await Promise.all([
      query.sort(sort).skip(skip).limit(limit),
      User.countDocuments(query.getFilter()),
    ]);

    res.status(200).json({
      message: "Admins retrieved successfully",
      success: true,
      data: {
        admins: admins.map((admin) => {
          const json = admin.toJSON();

          return {
            admin: {
              ...json,
              createdAt:
                admin.createdAt ??
                new Types.ObjectId(String(admin._id)).getTimestamp(),
            },
            permissions: permissionsForAdmin(admin),
          };
        }),
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
