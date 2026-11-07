import { CustomError } from "@/types";

export const createError = (message: string, statusCode = 500) => {
  const error = new Error(message) as CustomError;
  error.statusCode = statusCode;

  return error;
};
