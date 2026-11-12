/**
 * Central registry for administrative roles and permissions.
 *
 * Feature access must be decided by permissions, never by comparing role names
 * inline. Role names are only used here (and in privilege-escalation guards)
 * to map an account to its permission set.
 *
 * The five built-in roles below are always available. They can be extended at
 * runtime through the role-management API: persisted definitions are loaded
 * into this module's registry so the synchronous guards used by middleware keep
 * working without a database round-trip per request.
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

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "View dashboard",
  "users.view": "View users",
  "users.manage": "Manage user accounts",
  "vendors.view": "View vendors",
  "vendors.manage": "Manage vendors",
  "stores.view": "View stores",
  "stores.approve": "Approve stores",
  "stores.reject": "Reject stores",
  "stores.suspend": "Suspend stores",
  "products.view": "View products",
  "products.moderate": "Moderate products",
  "orders.view": "View orders",
  "orders.manage": "Manage orders",
  "transactions.view": "View transactions",
  "escrow.view": "View escrow",
  "financials.view": "View financial reports",
  "shipments.view": "View shipments",
  "shipments.manage": "Manage shipments",
  "disputes.view": "View disputes",
  "disputes.manage": "Manage disputes",
  "admins.view": "View administrators",
  "admins.invite": "Invite administrators",
  "admins.manage": "Manage administrator accounts",
  "roles.manage": "Manage roles and permissions",
  "audit_logs.view": "View audit logs",
  "settings.manage": "Manage platform settings",
};

export const PERMISSION_GROUPS: Record<string, readonly Permission[]> = {
  Dashboard: ["dashboard.view"],
  People: ["users.view", "users.manage"],
  Vendors: ["vendors.view", "vendors.manage"],
  Stores: ["stores.view", "stores.approve", "stores.reject", "stores.suspend"],
  Catalog: ["products.view", "products.moderate"],
  Orders: ["orders.view", "orders.manage"],
  Finance: [
    "transactions.view",
    "escrow.view",
    "financials.view",
  ],
  Logistics: ["shipments.view", "shipments.manage"],
  Support: ["disputes.view", "disputes.manage"],
  Administration: [
    "admins.view",
    "admins.invite",
    "admins.manage",
    "roles.manage",
    "audit_logs.view",
    "settings.manage",
  ],
};

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "OPERATIONS_ADMIN",
  "FINANCE_ADMIN",
  "SUPPORT_ADMIN",
  "CATALOG_ADMIN",
] as const;

export type BuiltInAdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Role keys are strings so persisted, custom roles can be assigned without
 * changing the account schema. Built-ins remain listed above for seeding and
 * documentation.
 */
export type AdminRole = string;

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

export const ROLE_PERMISSIONS: Record<
  BuiltInAdminRole,
  readonly Permission[]
> = {
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

export const ADMIN_ROLE_LABELS: Record<BuiltInAdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  OPERATIONS_ADMIN: "Operations Admin",
  FINANCE_ADMIN: "Finance Admin",
  SUPPORT_ADMIN: "Support Admin",
  CATALOG_ADMIN: "Catalog Admin",
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<BuiltInAdminRole, string> = {
  SUPER_ADMIN: "Full platform access and administrative control.",
  OPERATIONS_ADMIN: "Vendors, stores, orders and logistics.",
  FINANCE_ADMIN: "Transactions, escrow and financial reporting.",
  SUPPORT_ADMIN: "Customers, vendors and dispute resolution.",
  CATALOG_ADMIN: "Product catalog management and moderation.",
};

export interface AdminRoleDefinition {
  key: string;
  label: string;
  description: string;
  permissions: readonly Permission[];
  /** Built-in roles cannot be deleted; SUPER_ADMIN permissions are immutable. */
  system: boolean;
}

const builtInDefinitions = (): AdminRoleDefinition[] =>
  ADMIN_ROLES.map((key) => ({
    key,
    label: ADMIN_ROLE_LABELS[key],
    description: ADMIN_ROLE_DESCRIPTIONS[key],
    permissions: ROLE_PERMISSIONS[key],
    system: true,
  }));

const roleDefinitions = new Map<string, AdminRoleDefinition>(
  builtInDefinitions().map((definition) => [definition.key, definition]),
);

/**
 * Replaces the runtime role registry. Built-in roles that are missing from the
 * supplied list fall back to their code defaults.
 */
export const setRoleDefinitions = (
  definitions: readonly AdminRoleDefinition[],
): void => {
  roleDefinitions.clear();

  for (const definition of builtInDefinitions()) {
    roleDefinitions.set(definition.key, definition);
  }

  for (const definition of definitions) {
    if (!definition.key) continue;

    // The Super Admin always keeps the full registry. Persisted edits cannot
    // lock the platform out of administrative controls.
    const permissions =
      definition.key === "SUPER_ADMIN"
        ? [...PERMISSIONS]
        : definition.permissions.filter(isPermission);

    roleDefinitions.set(definition.key, {
      ...definition,
      permissions,
      system: definition.key === "SUPER_ADMIN" ? true : definition.system,
    });
  }
};

export const resetRoleDefinitions = (): void => {
  roleDefinitions.clear();

  for (const definition of builtInDefinitions()) {
    roleDefinitions.set(definition.key, definition);
  }
};

export const listRoleDefinitions = (): AdminRoleDefinition[] =>
  [...roleDefinitions.values()];

export const roleDefinitionFor = (
  role: string | null | undefined,
): AdminRoleDefinition | null =>
  role ? (roleDefinitions.get(role) ?? null) : null;

export const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === "string" && roleDefinitions.has(value);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === "string" && PERMISSIONS.includes(value as Permission);

export const permissionsForRole = (role: AdminRole): Permission[] => [
  ...(roleDefinitions.get(role)?.permissions ?? []),
];

export interface AdminPermissionSubject {
  adminRole?: AdminRole | null;
  permissionGrants?: Permission[] | null;
  permissionRevocations?: Permission[] | null;
}

/**
 * Resolves the effective permission set for an admin account. Per-admin grants
 * and revocations are applied on top of the role defaults.
 */
export const permissionsForAdmin = (
  subject: AdminPermissionSubject,
): Permission[] => {
  if (!subject.adminRole) return [];

  const effective = new Set<Permission>(
    permissionsForRole(subject.adminRole),
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
