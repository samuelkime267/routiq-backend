import crypto from "crypto";
import { hashKey } from "./hashKey";

export const generateToken = (options = { expiresInMinutes: 10 }) => {
  const { expiresInMinutes } = options;

  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashKey(token);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  return {
    token,
    hashedToken,
    expiresAt,
  };
};
