# Auth Integration Guide — Đăng ký, Xác thực Email OTP, Google Login & Quên mật khẩu

> **Base URL:** `/api/auth`
> **Source of truth:** `backend/src/controllers/authController.ts`, `backend/src/routes/auth.ts`
> **Áp dụng cho:** Frontend Web (React/Vite) & Mobile App (React Native / Expo).

---

## 1. Quy tắc Validation UI (trùng khớp 100% BE)

| Trường | Quy tắc bắt buộc | Thông báo gợi ý UI |
|---|---|---|
| **Họ tên (`name`)** | `2–100` ký tự, có ít nhất 1 chữ cái (hỗ trợ tiếng Việt có dấu), không chứa `<`, `>` | *"Họ tên phải từ 2 đến 100 ký tự và chứa chữ cái hợp lệ"* |
| **Email (`email`)** | Đúng định dạng `local@domain.tld` (TLD ≥ 2 chữ cái, không khoảng trắng, không `..`) | *"Email không hợp lệ"* |
| **Mật khẩu (`password` / `newPassword`)** | `8–128` ký tự, **không chứa khoảng trắng**, có đủ: **chữ hoa (`A-Z`) + chữ thường (`a-z`) + số (`0-9`) + ký tự đặc biệt (`!@#$%...`)** — VD mẫu: `Aa@12345` | *"Mật khẩu 8–128 ký tự, không khoảng trắng, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (VD: Aa@12345)"* |
| **Mã OTP (`otp`)** | Đúng **6 chữ số** (`^\d{6}$`) | UI dùng ô nhập 6 số (`inputMode="numeric"`, `maxLength={6}`) |

> 💡 **Lưu ý UX**: Form **Đăng ký** và **Đặt lại mật khẩu mới** nên hiển thị checklist realtime 4 tiêu chí mật khẩu (`8+ ký tự`, `Chữ hoa`, `Chữ thường`, `Số & ký tự đặc biệt`) + không dấu cách. Riêng form **Đăng nhập** chỉ kiểm tra không bỏ trống (không chặn định dạng cũ).

---

## 2. TypeScript DTO & Types (dùng chung Web & Mobile)

```ts
export type AuthProvider = "local" | "google" | "both";

export interface UserDto {
  _id: string;
  name: string;
  email: string;
  phone: string;
  roles: Array<"buyer" | "admin">;
  avatarUrl: string;
  accountStatus: "active" | "suspended";
  accountStatusReason: string;
  emailVerified: boolean;
  authProvider: AuthProvider;
  addresses: any[];
  createdAt?: string;
}

export interface AuthTokenResponse {
  token: string;
  user: UserDto;
}

export interface RegisterPendingResponse {
  requiresEmailVerification: true;
  message: string;
  email: string;
  expiresInSeconds: number;
  user: UserDto;
}

export interface GoogleAuthResponse extends AuthTokenResponse {
  isNewUser: boolean;
}
```

---

## 3. Luồng 1: Đăng ký + Xác thực Email bằng OTP 6 số

```
[Màn Đăng ký] ──POST /register──► 201 { requiresEmailVerification: true, email, expiresInSeconds }
                                        │
                                        ▼
[Màn Nhập OTP 6 số] ──(Bấm gửi lại, sau 60s)──► POST /resend-verification-otp { email }
       │
       └──POST /verify-email { email, otp }──► 200 { token, user } ──► Lưu JWT & vào Trang chủ
```

### UI cần làm (Web & Mobile)
1. **Màn / Tab Đăng ký**:
   - Input: `Họ tên`, `Email`, `Mật khẩu` (+ `Xác nhận mật khẩu` check ở FE), nút hiện/ẩn mật khẩu.
   - Bấm **Đăng ký** → gọi `POST /api/auth/register`.
   - Khi nhận `requiresEmailVerification === true`: **KHÔNG lưu token (chưa có)**, điều hướng sang **Màn xác thực OTP** truyền kèm `email` và khởi động đồng hồ đếm ngược **60 giây** cho nút Gửi lại mã.
2. **Màn Nhập OTP Xác thực Email**:
   - Hiển thị: *"Mã xác thực 6 số đã được gửi tới `<email>`. Mã có hiệu lực 10 phút."*
   - Ô nhập 6 chữ số + nút **Xác nhận** (`POST /api/auth/verify-email` `{ email, otp }`).
   - Nếu trả `200`: nhận `{ token, user }` → lưu JWT + user vào store/storage, điều hướng vào app (đã tự động đăng nhập).
   - Nút **Gửi lại mã** (disable trong 60s đếm ngược): gọi `POST /api/auth/resend-verification-otp` `{ email }`. Nếu bị `429 VERIFY_OTP_COOLDOWN`, đọc `error.details.retryAfterSeconds` để đếm ngược tiếp.
   - Nếu nhập sai OTP (`400 VERIFY_OTP_INVALID`): hiển thị số lượt còn lại từ `error.details.remainingAttempts`. Nếu bị `429 VERIFY_OTP_TOO_MANY_ATTEMPTS`: báo hết lượt sai và hướng dẫn bấm **Gửi lại mã**.
3. **Bắt trường hợp Đăng nhập khi chưa verify Email**:
   - Nếu user gọi `POST /api/auth/login` bị **`403 EMAIL_NOT_VERIFIED`**:
     - Hiện thông báo *"Tài khoản chưa xác thực email"* + nút **"Xác thực ngay"** → gọi `POST /api/auth/resend-verification-otp` (hoặc điều hướng thẳng sang màn Nhập OTP với `email` vừa nhập).

### API Contract — Đăng ký & Xác thực Email
- **`POST /api/auth/register`**
  - Body: `{ "name": "Nguyễn Văn A", "email": "a@gmail.com", "password": "Aa@12345" }`
  - Response `201` (hoặc `200` nếu email từng đăng ký nhưng chưa verify): `{ requiresEmailVerification: true, message, email, expiresInSeconds: 600, user }`
- **`POST /api/auth/verify-email`**
  - Body: `{ "email": "a@gmail.com", "otp": "123456" }`
  - Response `200`: `{ token, user }`
- **`POST /api/auth/resend-verification-otp`**
  - Body: `{ "email": "a@gmail.com" }`
  - Response `200`: `{ message, expiresInSeconds: 600 }`

---

## 4. Luồng 2: Đăng ký & Đăng nhập bằng Google Account

### Backend dùng `POST /api/auth/google`
- **Body**: `{ "idToken": "<Google_ID_Token_JWT>" }` *(hoặc `{ "credential": "<Google_ID_Token_JWT>" }`)*.
- **Response**: `201` (tạo tài khoản mới) hoặc `200` (đã có tài khoản) với `{ token, user, isNewUser }`.
- Backend tự verify chữ ký RS256 với Google JWKS, tự động đánh dấu `emailVerified: true`, tạo sẵn giỏ hàng cho user mới, và trả về JWT giống hệt `/login`.

### Hướng dẫn code UI phía FE Web (React/Vite)
- Cài `@react-oauth/google` (hoặc dùng Google Identity Services SDK):
  - Bọc app bằng `<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>`.
  - Ở màn **Đăng nhập** và **Đăng ký**, đặt nút `<GoogleLogin onSuccess={(res) => loginWithGoogle(res.credential)} ... />`.
  - Nhận `res.credential` (chính là `idToken`) → `POST /api/auth/google` với `{ credential: res.credential }` → lưu `{ token, user }` vào AuthContext/localStorage.
- *(Lưu ý: `VITE_GOOGLE_CLIENT_ID` trên Web phải nằm trong `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_IDS` ở BE `.env`, và cấu hình domain Web trong Google Cloud Console → Authorized JavaScript origins.)*

### Hướng dẫn code UI phía Mobile (React Native / Expo)
- Đặt nút **"Tiếp tục với Google"** ở cả màn Đăng nhập & Đăng ký:
  - Dùng `@react-native-google-signin/google-signin` (khuyên dùng cho Dev Build/Production):
    ```ts
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken ?? userInfo.idToken;
    // Gửi POST /api/auth/google với { idToken }
    ```
  - Hoặc dùng `expo-auth-session/providers/google` lấy `response.authentication?.idToken` / `response.params?.id_token`.
- ⚠️ Backend xác thực **Google `idToken` (JWT 3 đoạn `xxx.yyy.zzz`)**, **KHÔNG** gửi `accessToken` vào API này.

---

## 5. Luồng 3: Quên mật khẩu (Forgot Password OTP 6 số)

```
[Bước 1: Nhập Email] ──POST /forgot-password { email }──► 200 { expiresInSeconds: 600 }
        │
        ▼
[Bước 2: Nhập OTP 6 số] ──POST /verify-reset-otp { email, otp }──► 200 { valid: true, resetToken }
        │
        ▼
[Bước 3: Nhập MK mới] ──POST /reset-password { email, resetToken, newPassword }──► 200 ──► Về Login
```

*(Hoặc nếu UI làm 2 màn gộp OTP + Mật khẩu mới: bỏ qua bước 2, gọi thẳng `POST /api/auth/reset-password` với `{ email, otp, newPassword }`.)*

### API Contract — Quên mật khẩu
- **`POST /api/auth/forgot-password`**
  - Body: `{ "email": "a@gmail.com" }`
  - Response `200`: `{ "message": "Nếu email tồn tại trong hệ thống, mã OTP đặt lại mật khẩu đã được gửi.", "expiresInSeconds": 600 }`
- **`POST /api/auth/verify-reset-otp`**
  - Body: `{ "email": "a@gmail.com", "otp": "123456" }`
  - Response `200`: `{ "valid": true, "resetToken": "<hex>", "expiresInSeconds": 600 }`
- **`POST /api/auth/reset-password`**
  - Body (3 bước): `{ "email": "a@gmail.com", "resetToken": "<hex>", "newPassword": "Aa@12345" }`
  - Body (2 bước): `{ "email": "a@gmail.com", "otp": "123456", "newPassword": "Aa@12345" }`
  - Response `200`: `{ "message": "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới." }`

---

## 6. Bảng Error Codes Auth đầy đủ cho FE/Mobile

| `error.code` | HTTP | Ý nghĩa & Hành động UI |
|---|---|---|
| `MISSING_FIELD` | 400 | Thiếu trường bắt buộc → highlight ô đang trống |
| `INVALID_INPUT` | 400 | Sai định dạng tên / email / mật khẩu yếu (`Aa@12345`) → hiện `error.message` dưới field |
| `EMAIL_ALREADY_USED` | 409 | Email đã tồn tại và đã xác thực → gợi ý Đăng nhập hoặc Quên mật khẩu |
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu lúc đăng nhập |
| `FORBIDDEN` | 403 | Tài khoản bị khóa (`suspended`) |
| `EMAIL_NOT_VERIFIED` | 403 | Đăng nhập vào tài khoản chưa verify email → chuyển màn Nhập OTP |
| `EMAIL_ALREADY_VERIFIED` | 409 | Email đã kích hoạt rồi → chuyển thẳng về màn Đăng nhập |
| `VERIFY_OTP_INVALID` | 400 | Sai OTP xác thực đăng ký (`details.remainingAttempts`) |
| `VERIFY_OTP_EXPIRED` | 400 | OTP xác thực hết hạn 10 phút → bấm Gửi lại mã |
| `VERIFY_OTP_TOO_MANY_ATTEMPTS` | 429 | Nhập sai OTP xác thực quá 5 lần → phải gửi lại mã mới |
| `VERIFY_OTP_COOLDOWN` | 429 | Bấm gửi lại OTP xác thực trước 60s (`details.retryAfterSeconds`) |
| `RESET_OTP_INVALID` | 400 | Sai OTP quên mật khẩu (`details.remainingAttempts`) |
| `RESET_OTP_EXPIRED` | 400 | OTP hoặc `resetToken` quên mật khẩu đã hết hạn |
| `RESET_TOKEN_INVALID` | 400 | `resetToken` sai hoặc đã dùng → yêu cầu lại từ bước 1 |
| `RESET_OTP_TOO_MANY_ATTEMPTS` | 429 | Nhập sai OTP quên mật khẩu quá 5 lần |
| `RESET_OTP_COOLDOWN` | 429 | Bấm gửi lại OTP quên mật khẩu trước 60s (`details.retryAfterSeconds`) |
| `GOOGLE_TOKEN_INVALID` | 401 | `idToken` Google sai/hết hạn/sai Client ID → gọi lại luồng Google Sign-In |
| `UPSTREAM_ERROR` / `SERVICE_UNAVAILABLE` | 502 / 503 | Lỗi tạm thời hệ thống gửi mail hoặc Google Auth → báo thử lại sau |
