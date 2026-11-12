import type { NextFunction, Request, Response } from "express";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import type { UpdateSettingsSchemaType } from "@/schemas/settings";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "@/services/settings";
import { assertPermission } from "@/utils/adminAccess";

const SETTINGS_GROUPS = [
  "marketplace",
  "commission",
  "productCategories",
  "storeApproval",
  "shipping",
  "notifications",
  "security",
] as const;

export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertPermission(req.user, ["settings.manage"]);
    const input = req.body as UpdateSettingsSchemaType;

    const previous = await getPlatformSettings();
    const settings = await updatePlatformSettings(input, actor._id);

    const changedGroups = SETTINGS_GROUPS.filter(
      (group) => input[group] !== undefined,
    );

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "settings.updated",
      entityType: "settings",
      entityId: "platform",
      entityLabel: "Platform settings",
      previousState: Object.fromEntries(
        changedGroups.map((group) => [group, previous[group]]),
      ),
      newState: Object.fromEntries(
        changedGroups.map((group) => [group, settings[group]]),
      ),
      reason: input.reason ?? null,
      metadata: { groups: changedGroups },
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Platform settings updated successfully",
      success: true,
      data: { settings, changedGroups },
    });
  } catch (error) {
    next(error);
  }
};
