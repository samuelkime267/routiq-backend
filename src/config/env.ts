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
  process.env.FRONTEND_URL || "http://auth.localhost:3000";

export const ADMIN_URL =
  process.env.ADMIN_URL || "http://admin.localhost:3000";

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
