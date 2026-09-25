import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";

async function backup() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log("⏳ Connecting to MongoDB Atlas for backup...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected!");

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
  const backupDir = path.join(__dirname, "..", "backups", timestamp);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("Connection DB not available.");

    const collections = await db.listCollections().toArray();
    console.log(`📦 Found ${collections.length} collections. Starting backup...`);

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const documents = await db.collection(collectionName).find({}).toArray();
      
      const filePath = path.join(backupDir, `${collectionName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), "utf8");
      
      console.log(`   ✔️ Backed up ${collectionName} (${documents.length} documents)`);
    }

    console.log(`\n🎉 BACKUP PASS! Files saved to: ${backupDir}`);
  } catch (error) {
    console.error("❌ Backup failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
    process.exit(0);
  }
}

backup();
