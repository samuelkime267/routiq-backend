import crypto from "crypto";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateStoreSlug(name: string) {
  const base = slugify(name).slice(0, 50) || "store";
  const suffix = crypto.randomBytes(3).toString("hex");

  return `${base}-${suffix}`;
}
