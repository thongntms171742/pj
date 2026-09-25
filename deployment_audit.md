# Hướng dẫn & Audit trước khi Deploy (Public MVP)

## 1. Kết quả Audit Backend (Deployment Readiness)

| Hạng mục | Trạng thái | Chi tiết |
|---|---|---|
| **MONGODB_URI** | ✅ PASS | Đã tắt sync trong `render.yaml`. Sẽ nhập thủ công URI Production trên Render để bảo mật. |
| **JWT Secret** | ✅ PASS | `render.yaml` đã dùng `generateValue: true` tự động sinh mã an toàn. |
| **CORS** | ✅ PASS | `app.ts` đã cấu hình `cors({ origin: true, credentials: true })` (phù hợp MVP). |
| **File Upload** | ✅ PASS | Không lưu file local (chỉ lưu URL). An toàn trên cloud ephemeral file system. |
| **Log Credentials** | ✅ PASS | Không log password hay JWT ra console. |
| **Port** | ✅ PASS | Tự động binding `process.env.PORT` từ Render. |
| **.env Commit** | ✅ PASS | `.gitignore` đã chặn các file `.env`. |

---

## 2. Các điểm Frontend cần ĐIỀU CHỈNH (Note giao cho team Frontend)

Do nguyên tắc **Freeze Code Frontend**, hệ thống AI không tự sửa, vui lòng chuyển các note này cho người phụ trách giao diện:

1. **Lỗi đường dẫn thư mục build trên Render (`render.yaml`)**
   - **Vấn đề**: Trong `render.yaml`, web static được cấu hình `rootDir: frontend`. Nhưng hiện tại `package.json` và `vite.config.ts` của frontend đang nằm ở **thư mục gốc (root)**, còn thư mục `frontend/` lại không chứa `package.json`.
   - **Cách fix**:
     Sửa `render.yaml` từ `rootDir: frontend` thành `rootDir: .` **HOẶC** chuyển toàn bộ file cấu hình Vite/React (như `package.json`, `vite.config.ts`, `index.html`) vào hẳn bên trong thư mục `frontend/`.

2. **Cập nhật Interface / Types cho `ApiOrder` (`api.ts`)**
   - **Vấn đề**: API Backend đã đổi cấu trúc phí từ `platformFee: number` thành `platformFeeRate: number`, `platformFeeAmount: number`, và `sellerAmount: number`.
   - **Cách fix**: Cập nhật lại type `ApiOrder` trong `src/lib/api.ts` để TypeScript không báo lỗi khi render chi tiết Order.

3. **Luồng Admin/Seller**
   - Cần chắc chắn `App.tsx` sử dụng đúng đường dẫn API (Vite proxy `/api` sang `VITE_API_URL`). (Đã cấu hình đúng qua biến môi trường Render tự động link).

---

## 3. Các bước thực hiện Deploy lên Render

1. **MongoDB Atlas Network:**
   - Đăng nhập [MongoDB Atlas](https://cloud.mongodb.com).
   - Vào mục **Network Access** > Add IP Address > Chọn **"Allow Access from Anywhere"** (`0.0.0.0/0`) vì Render thay đổi IP liên tục.
2. **Đẩy code lên GitHub:**
   - Đảm bảo nhánh hiện tại (e.g. `backend`) đã được push lên GitHub đầy đủ.
3. **Deploy trên Render:**
   - Kết nối GitHub vào [Render](https://render.com).
   - Chọn **Blueprint** > Connect vào repo này.
   - Render sẽ tự động đọc `render.yaml` và tạo 2 service: `thriftit-backend` và `thriftit-frontend`.
   - **Lưu ý lúc tạo:** Render sẽ hỏi giá trị của `MONGODB_URI`. Hãy nhập Connection String thật của cluster Atlas.
4. **Tạo tài khoản Admin (Thủ công):**
   - Sau khi deploy, mở trang Frontend public, tạo tài khoản tên `admin@thriftit.vn`.
   - Vào MongoDB Atlas > Collections > Users > Sửa document đó, thêm `"admin"` vào mảng `roles`.

Sau 4 bước này, toàn bộ hệ thống sẽ public. Mọi luồng demo (Buyer, Seller, Checkout, Tracking) đều có thể chạy trên trình duyệt di động thật!
