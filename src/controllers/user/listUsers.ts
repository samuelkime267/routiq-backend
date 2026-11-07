import { NextFunction, Request, Response } from "express";
import User from "@/models/user.model";
import { listUsersQuerySchema } from "@/schemas/user";

export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role, status, page, limit } = listUsersQuerySchema.parse(req.query);
    const filter = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    };
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      message: "Users retrieved successfully",
      success: true,
      data: {
        users,
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
