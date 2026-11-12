import mongoose from "mongoose";
import {
  ADMIN_ROLES,
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AdminRoleDefinition,
  type Permission,
  isPermission,
  listRoleDefinitions,
  roleDefinitionFor,
  setRoleDefinitions,
} from "@/config/permissions";
import AdminRoleDefinitionModel from "@/models/adminRoleDefinition.model";

function toDefinition(document: {
  key: string;
  label: string;
  description?: string | null;
  permissions?: string[] | null;
  system?: boolean | null;
}): AdminRoleDefinition {
  return {
    key: document.key,
    label: document.label,
    description: document.description ?? "",
    permissions: (document.permissions ?? []).filter(isPermission),
    system: Boolean(document.system),
  };
}

/**
 * Seeds the five built-in roles on first run. `$setOnInsert` keeps later edits
 * made through the role-management API intact.
 */
export async function seedBuiltInAdminRoles(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  await Promise.all(
    ADMIN_ROLES.map((key) =>
      AdminRoleDefinitionModel.updateOne(
        { key },
        {
          $setOnInsert: {
            key,
            label: ADMIN_ROLE_LABELS[key],
            description: ADMIN_ROLE_DESCRIPTIONS[key],
            permissions: [...ROLE_PERMISSIONS[key]],
            system: true,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

/**
 * Loads every persisted role into the synchronous permission registry used by
 * middleware. Called on startup and after every role mutation.
 */
export async function refreshAdminRoleRegistry(): Promise<AdminRoleDefinition[]> {
  if (mongoose.connection.readyState !== 1) return listRoleDefinitions();

  const documents = await AdminRoleDefinitionModel.find().sort({ key: 1 }).lean();
  setRoleDefinitions(documents.map(toDefinition));

  return listRoleDefinitions();
}

export async function initializeAdminRoles(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;

    await seedBuiltInAdminRoles();
    await refreshAdminRoleRegistry();
  } catch (error) {
    console.error("[admin-roles] failed to initialise role registry", error);
  }
}

/**
 * Resolves a role by stable key (`SUPER_ADMIN`) or Mongo id. The public API
 * uses the persisted id, while permission checks and invitations use the key.
 */
export async function findRoleDefinition(roleId: string) {
  if (/^[a-f\d]{24}$/i.test(roleId)) {
    const byId = await AdminRoleDefinitionModel.findById(roleId);
    if (byId) return byId;
  }

  return AdminRoleDefinitionModel.findOne({ key: roleId.toUpperCase() });
}

export function permissionsWithinAuthority(
  actorPermissions: readonly Permission[],
  requested: readonly Permission[],
): Permission[] {
  const held = new Set(actorPermissions);
  return requested.filter((permission) => held.has(permission));
}

/**
 * Used by the role controller after a definition is saved. Keeps the process
 * registry in step without requiring a restart.
 */
export async function reloadAdminRoleRegistry() {
  return refreshAdminRoleRegistry();
}

export { roleDefinitionFor };
