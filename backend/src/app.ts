import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import "./models"; // Ensure all Mongoose models are registered
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import productRoutes from "./routes/products";
import sellerRoutes from "./routes/sellers";
import cartRoutes from "./routes/cart";
import orderRoutes from "./routes/orders";
import paymentRoutes from "./routes/payments";
import notificationRoutes from "./routes/notifications";
import adminRoutes from "./routes/admin";
import aiRoutes from "./routes/ai";
import addressRoutes from "./routes/addresses";
import { sendError, ErrorCode, handleInternalError } from "./utils/errors";

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);

// ── 404 catch-all ──────────────────────────────────────────────────────────────
app.use("/api/*", (_req, res) => {
  sendError(res, ErrorCode.NOT_FOUND, "Endpoint không tồn tại", 404);
});

// ── Global error handler ──────────────────────────────────────────────────────
// Bắt mọi lỗi không được xử lý từ controller (e.g. thrown errors từ middleware).
// Express yêu cầu 4 tham số để nhận diện error middleware.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  handleInternalError(res, err, "[express] uncaught error");
});

export default app;