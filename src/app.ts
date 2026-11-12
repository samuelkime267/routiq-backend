import express from "express";
import { connectDb } from "./config/db";
import authRouter from "./routes/auth.route";
import { errorMiddleware } from "./middleware/error.middleware";
import cookieParser from "cookie-parser";
import { FRONTEND_URL, PORT } from "./config/env";
import usersRouter from "./routes/user.route";
import transactionRouter from "./routes/transaction.route";
import escrowRouter from "./routes/escrow.route";
import financialRouter from "./routes/financial.route";
import disputeRouter from "./routes/dispute.route";
import cors from "cors";
import passport from "passport";
import "@/config/passport";
import userRouter from "./routes/user.route";
import storeRouter from "./routes/store.route";
import uploadRouter from "./routes/upload.route";
import adminRouter from "./routes/admin.route";
import vendorRouter from "./routes/vendor.route";
import productRouter from "./routes/product.route";
import categoryRouter from "./routes/category.route";
import searchRouter from "./routes/search.route";
import notificationRouter from "./routes/notification.route";
import orderRouter from "./routes/order.route";
import shipmentRouter from "./routes/shipment.route";
import adminsRouter from "./routes/admins.route";
import adminRoleRouter from "./routes/adminRole.route";
import permissionRouter from "./routes/permission.route";
import auditLogRouter from "./routes/auditLog.route";
import settingsRouter from "./routes/settings.route";
import { initializeAdminRoles } from "@/services/adminRoles";
import morgan from "morgan";
const app = express();

const logger = morgan("dev");
app.use(logger);

const allowedOrigins = [
  "http://localhost:3000",
  "http://auth.localhost:3000",
  "http://vendor.localhost:3000",
  "http://admin.localhost:3000",
  "http://localhost:5173",
  FRONTEND_URL,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(passport.initialize());
app.use(
  express.json({
    // Provider webhooks sign the exact request bytes, so keep a raw copy for
    // HMAC verification before the body is parsed.
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(cookieParser());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/admins", adminsRouter);
app.use("/api/v1/admin-roles", adminRoleRouter);
app.use("/api/v1/permissions", permissionRouter);
app.use("/api/v1/audit-logs", auditLogRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/transactions", transactionRouter);
app.use("/api/v1/escrow", escrowRouter);
app.use("/api/v1/financials", financialRouter);
app.use("/api/v1/disputes", disputeRouter);
app.use("/api/v1/stores", storeRouter);
app.use("/api/v1/vendors", vendorRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/uploads", uploadRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/shipments", shipmentRouter);

app.use(errorMiddleware);

connectDb(() => {
  // Persisted/custom roles must be loaded before the first request so the
  // synchronous permission guards recognise them.
  initializeAdminRoles().finally(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
      console.log(`BASE URL: http://localhost:${PORT}/api/v1`);
    });
  });
});
