import mongoose, { type Types } from "mongoose";
import Notification, {
  type NotificationType,
} from "@/models/notification.model";

export interface VendorNotificationInput {
  recipient: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  href?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Normalises a notification document before it is written. Kept pure so the
 * shape can be unit tested without a Mongo connection.
 */
export function buildVendorNotification(input: VendorNotificationInput) {
  return {
    recipient: input.recipient,
    type: input.type,
    title: input.title,
    message: input.message,
    href: input.href ?? null,
    metadata: input.metadata ?? {},
    readAt: null,
  };
}

/**
 * Creates an in-app notification for a vendor.
 *
 * Notifications are a side effect of a workflow action: a delivery failure must
 * never roll back the status change that was already saved, so errors are
 * reported and swallowed. The connection guard mirrors `recordActivity` and
 * keeps unit tests from buffering writes.
 */
export async function notifyVendor(
  input: VendorNotificationInput,
): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  try {
    await Notification.create(buildVendorNotification(input));
  } catch (error) {
    console.error("[notifications] failed to create notification", error);
  }
}
