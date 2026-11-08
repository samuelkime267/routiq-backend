import type { Permission } from "@/config/permissions";
import Product from "@/models/product.model";
import type { UserDocument } from "@/models/user.model";
import { assertPermission } from "@/utils/adminAccess";
import { createError } from "@/utils";
import { performProductAction, type ProductAction } from "./workflow";

export interface AdminProductActionInput {
  productId: string;
  admin: UserDocument;
  action: ProductAction;
  permission: Permission;
  reason?: string | null;
  note?: string | null;
}

/**
 * Shared entry point for the product action controllers: permission check,
 * existence check and workflow execution in one place.
 */
export async function runAdminProductAction({
  productId,
  admin,
  action,
  permission,
  reason,
  note,
}: AdminProductActionInput) {
  assertPermission(admin, [permission]);

  const product = await Product.findById(productId);
  if (!product) throw createError("Product not found", 404);

  const result = await performProductAction({
    product,
    action,
    actor: admin,
    reason,
    note,
  });

  return result;
}
