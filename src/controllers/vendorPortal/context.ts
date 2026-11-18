import type { Request } from "express";
import type { StoreDocument } from "@/models/store.model";
import type { UserDocument } from "@/models/user.model";
import { createError } from "@/utils";
import { loadVendorStore } from "@/services/vendorPortal/access";

/**
 * Resolves the authenticated vendor and their store for a request.
 *
 * The vendor id always comes from the access token, never from a route
 * parameter or query string, which is what keeps every vendor-scoped endpoint
 * safely multi-tenant.
 */
export async function vendorContext(
  req: Request,
): Promise<{ vendor: UserDocument; store: StoreDocument }> {
  const vendor = req.user;

  if (!vendor) throw createError("User not authenticated", 401);

  const store = await loadVendorStore(vendor);

  return { vendor, store };
}
