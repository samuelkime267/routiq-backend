import express from "express";
import { connectDb } from "./config/db";
import authRouter from "./routes/auth.route";
import { errorMiddleware } from "./middleware/error.middleware";
import cookieParser from "cookie-parser";
import { FRONTEND_URL, PORT } from "./config/env";
import cors from "cors";
import passport from "passport";
import "@/config/passport";
import userRouter from "./routes/user.route";
import storeRouter from "./routes/store.route";
import uploadRouter from "./routes/upload.route";
import adminRouter from "./routes/admin.route";
import vendorRouter from "./routes/vendor.route";
import productRouter from "./routes/product.route";
import notificationRouter from "./routes/notification.route";
import orderRouter from "./routes/order.route";
import shipmentRouter from "./routes/shipment.route";
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
app.use("/api/v1/user", userRouter);
app.use("/api/v1/stores", storeRouter);
app.use("/api/v1/vendors", vendorRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/uploads", uploadRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/shipments", shipmentRouter);

app.use(errorMiddleware);

connectDb(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
    console.log(`BASE URL: http://localhost:${PORT}/api/v1`);
  });
});
