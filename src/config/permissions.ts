/**
 * Central registry for administrative roles and permissions.
 *
 * Feature access must be decided by permissions, never by comparing role names
 * inline. Role names are only used here (and in privilege-escalation guards)
 * to map an account to its permission set.
 */

export const PERMISSIONS = [
  "dashboard.view",
  "users.view",
  "users.manage",
  "vendors.view",
  "vendors.manage",
  "stores.view",
  "stores.approve",
  "stores.reject",
  "stores.suspend",
  "products.view",
  "products.moderate",
  "orders.view",
  "orders.manage",
  "transactions.view",
  "escrow.view",
  "financials.view",
  "shipments.view",
  "shipments.manage",
  "disputes.view",
  "disputes.manage",
  "admins.view",
  "admins.invite",
  "admins.manage",
  "roles.manage",
  "audit_logs.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "OPERATIONS_ADMIN",
  "FINANCE_ADMIN",
  "SUPPORT_ADMIN",
  "CATALOG_ADMIN",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_STATUSES = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

export type AdminStatus = (typeof ADMIN_STATUSES)[number];

/**
 * Permissions that only a Super Admin should ever hold by default. They are
 * also the permissions a Super Admin must explicitly grant to another role.
 */
export const SUPER_ADMIN_ONLY_PERMISSIONS: readonly Permission[] = [
  "admins.view",
  "admins.invite",
  "admins.manage",
  "roles.manage",
  "audit_logs.view",
  "settings.manage",
];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  OPERATIONS_ADMIN: [
    "dashboard.view",
    "users.view",
    "users.manage",
    "vendors.view",
    "vendors.manage",
    "stores.view",
    "stores.approve",
    "stores.reject",
    "stores.suspend",
    "products.view",
    "orders.view",
    "orders.manage",
    "shipments.view",
    "shipments.manage",
  ],
  FINANCE_ADMIN: [
    "dashboard.view",
    "users.view",
    "vendors.view",
    "orders.view",
    "transactions.view",
    "escrow.view",
    "financials.view",
  ],
  SUPPORT_ADMIN: [
    "dashboard.view",
    "users.view",
    "users.manage",
    "vendors.view",
    "stores.view",
    "orders.view",
    "disputes.view",
    "disputes.manage",
  ],
  CATALOG_ADMIN: [
    "dashboard.view",
    "vendors.view",
    "stores.view",
    "products.view",
    "products.moderate",
  ],
};

export interface AdminPermissionSubject {
  adminRole?: AdminRole | null;
  permissionGrants?: Permission[] | null;
  permissionRevocations?: Permission[] | null;
}

export const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === "string" && ADMIN_ROLES.includes(value as AdminRole);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === "string" && PERMISSIONS.includes(value as Permission);

export const permissionsForRole = (role: AdminRole): Permission[] => [
  ...ROLE_PERMISSIONS[role],
];

/**
 * Resolves the effective permission set for an admin account. Per-admin grants
 * and revocations are applied on top of the role defaults.
 */
export const permissionsForAdmin = (
  subject: AdminPermissionSubject,
): Permission[] => {
  if (!subject.adminRole) return [];

  const effective = new Set<Permission>(
    ROLE_PERMISSIONS[subject.adminRole],
  );

  for (const permission of subject.permissionGrants ?? []) {
    if (isPermission(permission)) effective.add(permission);
  }

  for (const permission of subject.permissionRevocations ?? []) {
    if (isPermission(permission)) effective.delete(permission);
  }

  return [...effective];
};

export const hasPermission = (
  subject: AdminPermissionSubject,
  permission: Permission,
) => permissionsForAdmin(subject).includes(permission);

export const hasEveryPermission = (
  subject: AdminPermissionSubject,
  permissions: readonly Permission[],
) => permissions.every((permission) => hasPermission(subject, permission));

export const hasAnyPermission = (
  subject: AdminPermissionSubject,
  permissions: readonly Permission[],
) => permissions.some((permission) => hasPermission(subject, permission));
