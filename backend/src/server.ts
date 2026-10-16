import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import app from "./app";
import { initSocket } from "./services/socket";
import { initSocketServer } from "./services/chat/socketService";

const PORT = parseInt(process.env.PORT || "4000", 10);
const MONGODB_URI = process.env.MONGODB_URI || "";

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
    // Initialize shared socket server
    const io = initSocket(httpServer);
    initSocketServer(httpServer, io);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Backend server running on http://localhost:${PORT}`);
      console.log(`   Health check: http://localhost:${PORT}/api/health`);
      console.log(`   Socket.io realtime chat initialized on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
