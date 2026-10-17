import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";

import "./models"; // Ensure all Mongoose models are registered
import { requestId } from "./middleware/requestId";
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
import couponRoutes from "./routes/coupons";
import uploadRoutes from "./routes/uploads";
import bannerRoutes from "./routes/banners";
import chatRoutes from "./routes/chat";
import shippingRoutes from "./routes/shipping";
import reviewRoutes from "./routes/reviews";
import productRoutes from "./routes/products";
import { sendError, ErrorCode, handleInternalError } from "./utils/errors";

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────────
// requestId must be registered FIRST so every other middleware and route
// handler has `req.id` available for logging / error tracing.
app.use(requestId);
// ── CORS: allow Vercel domain (production) + localhost (dev) ────────────────
const ALLOWED_ORIGINS = [
  "https://rungtrongpho.vercel.app",
  // Vercel preview URLs (any sub-branch) — pattern matched below
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / no-origin (curl, Postman, server-to-server)
    if (!origin) return cb(null, true);
    const allowed = ALLOWED_ORIGINS.some((o) =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
    if (allowed) return cb(null, true);
    cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
}));

// Serve static uploads
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// Custom JSON parser wrapper — body-parser in strict mode rejects bodies that
// are valid JSON literals (null, "string", 123, true, []) with
// "entity.parse.failed" → would bubble to 500. Convert to a clean INVALID_INPUT.
app.use((req: Request, res: Response, next: NextFunction) => {
  express.json({ limit: "10mb" })(req, res, (err: any) => {
    if (err && err.type === "entity.parse.failed") {
      sendError(res, ErrorCode.INVALID_INPUT, "Body không phải JSON object hợp lệ");
      return;
    }
    if (err) {
      // Other body errors (payload too large, encoding, etc.)
      sendError(res, ErrorCode.INVALID_INPUT, "Body không hợp lệ");
      return;
    }
    next();
  });
});

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
app.use("/api/coupons", couponRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/products", productRoutes);

// ── 404 catch-all ──────────────────────────────────────────────────────────────
app.use("/api/*", (_req, res) => {
  sendError(res, ErrorCode.NOT_FOUND, "Endpoint không tồn tại", 404);
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  handleInternalError(res, err, "[express] uncaught error");
});

export default app;