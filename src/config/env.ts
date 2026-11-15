import dotenv from "dotenv";

dotenv.config();

export const PORT = Number(process.env.PORT) || 2607;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const MONGO_URL = process.env.MONGO_URL || "";
export const JWT_SECRET = process.env.JWT_SECRET || "overlysecretsomething";
export const JWT_ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ||
  "5m") as `${number}`;
export const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ||
  "30d") as `${number}`;
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export const SMTP_HOST = process.env.SMTP_HOST || "";
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const SMTP_SECURE =
  (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
export const SMTP_SERVICE = process.env.SMTP_SERVICE || "";
export const SMTP_USER = process.env.SMTP_USER || "";
export const SMTP_PASS = process.env.SMTP_PASS || "";
export const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Routiq";
export const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || "";

export const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";

export const ADMIN_URL =
  process.env.ADMIN_URL || "http://admin.localhost:3000";

/**
 * Vendor app origin. Every app serves its own auth routes, so vendor password
 * reset links must point at the vendor host rather than the marketplace.
 */
export const VENDOR_URL =
  process.env.VENDOR_URL || "http://vendor.localhost:3000";

export const HASH_SECRET = process.env.HASH_SECRET || "";

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
export const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "routiq";

/**
 * Shipbubble is the external logistics provider. The key is only ever read by
 * the backend; the admin API returns provider statuses and errors, never these
 * credentials.
 */
export const SHIPBUBBLE_API_KEY = process.env.SHIPBUBBLE_API_KEY || "";
export const SHIPBUBBLE_BASE_URL =
  process.env.SHIPBUBBLE_BASE_URL || "https://api.shipbubble.com/v1";

/**
 * Shipbubble requires an email on every address-validation call. Address book
 * entries do not store one, so this contact address is used as the fallback.
 */
export const SHIPBUBBLE_CONTACT_EMAIL =
  process.env.SHIPBUBBLE_CONTACT_EMAIL || "support@routiq.ng";

/**
 * Optional fixed package category for rate lookups. When unset, the account's
 * category list is fetched and a sensible default is chosen, because Shipbubble
 * rejects the request when `category_id` is missing or unknown.
 */
export const SHIPBUBBLE_CATEGORY_ID = Number(
  process.env.SHIPBUBBLE_CATEGORY_ID || 0,
);

/**
 * Paystack is the payment provider used for customer checkout. Only the secret
 * key is required on the server; the public key may be exposed to the browser
 * for display purposes but the hosted checkout page is always used, so the
 * secret is never part of a response.
 *
 * Both key names are accepted because the existing environment file contains
 * the historical `PAYSTAK_PUBLIC_KEY` spelling.
 */
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
export const PAYSTACK_PUBLIC_KEY =
  process.env.PAYSTACK_PUBLIC_KEY || process.env.PAYSTAK_PUBLIC_KEY || "";
export const PAYSTACK_BASE_URL =
  process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
export const PAYSTACK_WEBHOOK_SECRET =
  process.env.PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET_KEY;

/** Public marketplace origin used for payment callback redirects. */
export const MARKETPLACE_URL =
  process.env.MARKETPLACE_URL || "http://localhost:3000";

/**
 * Development-only escape hatch: when Shipbubble is configured but cannot quote
 * (outage, blocked account), fall back to the platform's configured delivery
 * fee so checkout and payment can still be exercised locally. It is ignored in
 * production because the real rate must come from the courier.
 */
export const DELIVERY_PLATFORM_FALLBACK =
  (process.env.DELIVERY_PLATFORM_FALLBACK || "false").toLowerCase() === "true";
