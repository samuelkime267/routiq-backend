import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "@/models/user.model";
import { MONGO_URL } from "@/config/env";
import {
  ADMIN_ROLES,
  type AdminRole,
} from "@/config/permissions";

const resolveAdminRole = (): AdminRole => {
  const requested = (process.env.ADMIN_ROLE || "SUPER_ADMIN").trim();

  if (!(ADMIN_ROLES as readonly string[]).includes(requested)) {
    throw new Error(
      `ADMIN_ROLE must be one of: ${ADMIN_ROLES.join(", ")}`,
    );
  }

  return requested as AdminRole;
};

const createAdmin = async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const adminRole = resolveAdminRole();

  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before running this script");
  }
  if (!MONGO_URL) {
    throw new Error("MONGO_URL is not configured");
  }

  await mongoose.connect(MONGO_URL);

  const hashedPassword = await bcrypt.hash(password, 10);
  const existingUser = await User.findOne({ email }).select("+password");

  if (existingUser) {
    existingUser.role = "admin";
    existingUser.adminRole = adminRole;
    existingUser.adminStatus = "ACTIVE";
    existingUser.permissionGrants = [];
    existingUser.permissionRevocations = [];
    existingUser.status = "active";
    existingUser.isEmailVerified = true;
    existingUser.password = hashedPassword;
    await existingUser.save();

    console.log(`Promoted ${email} to ${adminRole}`);
  } else {
    await User.create({
      email,
      name: "Routiq Admin",
      password: hashedPassword,
      role: "admin",
      adminRole,
      adminStatus: "ACTIVE",
      permissionGrants: [],
      permissionRevocations: [],
      status: "active",
      isEmailVerified: true,
      invitedAt: new Date(),
    });

    console.log(`Created ${adminRole} account for ${email}`);
  }

  await mongoose.disconnect();
};

createAdmin()
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
