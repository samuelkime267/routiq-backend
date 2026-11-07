import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/controllers/notification";
import { isAuthenticated } from "@/middleware";

const notificationRouter = Router();

notificationRouter.use(isAuthenticated);

notificationRouter.get("/", listNotifications);
notificationRouter.patch("/read-all", markAllNotificationsRead);
notificationRouter.patch("/:notificationId/read", markNotificationRead);

export default notificationRouter;
