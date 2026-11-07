import { Router } from "express";
import { uploadFile } from "@/controllers/upload";
import { authorizeRoles, isAuthenticated } from "@/middleware";
import { upload } from "@/middleware/upload.middleware";
import { uploadFileValidator } from "@/validators/upload.validator";

const uploadRouter = Router();

uploadRouter.post(
  "/",
  isAuthenticated,
  authorizeRoles("vendor", "admin"),
  upload,
  uploadFileValidator,
  uploadFile,
);

export default uploadRouter;
