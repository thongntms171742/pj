import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import { createServer } from "http";
import app from "./app";
<<<<<<< HEAD
import { initSocketServer } from "./services/chat/socketService";
=======
import { initSocket } from "./services/socket";
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8

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

<<<<<<< HEAD
    const httpServer = http.createServer(app);
    initSocketServer(httpServer);
=======
    // Create HTTP server (required for Socket.io)
    const httpServer = createServer(app);

    // Initialize Socket.io
    initSocket(httpServer);
    console.log("✅ Socket.io initialized");
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8

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
