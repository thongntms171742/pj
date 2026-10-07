import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import "./models"; // Ensure all Mongoose models are registered
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import addressRoutes from "./routes/addresses";
import catalogRoutes from "./routes/catalog";
import designRoutes from "./routes/designs";
import cartRoutes from "./routes/cart";
import orderRoutes from "./routes/orders";
import paymentRoutes from "./routes/payments";
import notificationRoutes from "./routes/notifications";
import adminRoutes from "./routes/admin";
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
app.use("/api/catalog", catalogRoutes);
app.use("/api/designs", designRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

// ── 404 catch-all ──────────────────────────────────────────────────────────────
app.use("/api/*", (_req, res) => {
  sendError(res, ErrorCode.NOT_FOUND, "Endpoint không tồn tại", 404);
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  handleInternalError(res, err, "[express] uncaught error");
});

export default app;