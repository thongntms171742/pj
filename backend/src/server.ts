import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app";
import { setRealtimeIO } from "./services/realtime";
import { initChatSocket } from "./modules/chat/socket/chatSocket";

const PORT = parseInt(process.env.PORT || "4000", 10);
const MONGODB_URI = process.env.MONGODB_URI || "";

const ALLOWED_ORIGINS = [
  "https://rungtrongpho.vercel.app",
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
];

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((o) =>
    typeof o === "string" ? o === origin : o.test(origin)
  );
}

function setupSockets(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (isOriginAllowed(origin)) return cb(null, true);
        cb(new Error(`CORS: socket origin not allowed — ${origin}`), false);
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 20_000,
    pingTimeout: 25_000,
    upgradeTimeout: 30_000,
    maxHttpBufferSize: 1e6,
    allowEIO3: true,
  });

  setRealtimeIO(io);
  initChatSocket(io);

  return io;
}

async function start() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  try {
    console.log("⏳ Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB Atlas");

    const httpServer = http.createServer(app);
    setupSockets(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Backend server running on http://localhost:${PORT}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health`);
      console.log(`   Socket.io realtime chat initialized on port ${PORT} (namespace /chat)`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
