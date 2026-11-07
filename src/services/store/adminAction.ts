import type { Permission } from "@/config/permissions";
import Store from "@/models/store.model";
import type { UserDocument } from "@/models/user.model";
import { assertPermission } from "@/utils/adminAccess";
import { createError } from "@/utils";
import { performStoreAction, type StoreAction } from "./workflow";

export interface AdminStoreActionInput {
  storeId: string;
  admin: UserDocument;
  action: StoreAction;
  permission: Permission;
  reason?: string | null;
  message?: string | null;
  note?: string | null;
}

/**
 * Shared entry point for the store action controllers: permission check,
 * existence check and workflow execution in one place.
 */
export async function runAdminStoreAction({
  storeId,
  admin,
  action,
  permission,
  reason,
  message,
  note,
}: AdminStoreActionInput) {
  assertPermission(admin, [permission]);

  const store = await Store.findById(storeId);
  if (!store) throw createError("Store not found", 404);

  const result = await performStoreAction({
    store,
    action,
    actor: admin,
    reason,
    message,
    note,
  });

  return result;
}
