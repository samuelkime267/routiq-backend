import { Router } from "express";
import { getAdminProfile, updateAdminProfile } from "@/controllers/admin";
import { getSettings, updateSettings } from "@/controllers/settings";
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";
import { adminProfileValidator } from "@/validators/admin.validator";
import { updateSettingsValidator } from "@/validators/settings.validator";

const settingsRouter = Router();

settingsRouter.use(isAuthenticated, requireAdmin);

// Personal profile settings are available to every active administrator.
settingsRouter.get("/profile", getAdminProfile);
settingsRouter.patch("/profile", adminProfileValidator, updateAdminProfile);

// Platform-wide configuration is separately permissioned.
settingsRouter.get("/", requirePermission("settings.manage"), getSettings);
settingsRouter.patch(
  "/",
  requirePermission("settings.manage"),
  updateSettingsValidator,
  updateSettings,
);

export default settingsRouter;
