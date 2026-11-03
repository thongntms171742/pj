/**
 * env.ts — đọc biến môi trường theo cách AN TOÀN với ES module hoisting.
 *
 * Vấn đề:
 *   Trong CommonJS (ts-node / build), tất cả `import` ở đầu file đều được
 *   `require()` TRƯỚC khi code trong file thực thi. Nên nếu ta đọc
 *   `process.env.X` ở cấp module, biến đó có thể chưa được nạp từ `.env`.
 *
 *   ```ts
 *   import dotenv from "dotenv";
 *   dotenv.config();                    // ← chạy SAU các require()
 *   import auth from "./middleware/auth"; // ← đã đọc process.env.JWT_SECRET
 *   ```
 *
 * Giải pháp:
 *   Đọc env qua HÀM (lazy) thay vì hằng số ở cấp module. Hàm được gọi lúc
 *   runtime ⇒ `.env` chắc chắn đã nạp xong.
 */

/** Lấy secret JWT — đọc lazy mỗi lần gọi. */
export function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || "thriftit_super_secret_key_change_me";
}

/** Lấy JWT expiry — đọc lazy. */
export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || "7d";
}

/** Lấy URI MongoDB — đọc lazy. */
export function getMongoUri(): string {
  return process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim() || "";
}

/** Lấy port server — đọc lazy. */
export function getPort(): number {
  const parsed = Number.parseInt(process.env.PORT?.trim() || "4000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}
