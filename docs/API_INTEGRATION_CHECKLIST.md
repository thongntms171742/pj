# API Integration Checklist — Build Your Christmas

> **Audience:** Frontend team (sử dụng khi build form gọi `/api/auth/*` và các endpoint có body).
> **Mục đích:** Giảm thiểu 500 INTERNAL_ERROR từ BE bằng cách validate input ở FE trước khi gửi.

## Nguyên tắc chung

1. **Luôn gửi `Content-Type: application/json` header** (mặc định của `fetch`/`axios`).
2. **Body PHẢI là JSON object** `{}` — KHÔNG gửi `null`, string, number, boolean, array ở top-level.
3. **Mọi field trong body phải là string** (trừ khi BE doc ghi rõ khác). `password: 123456` → BE sẽ 400 `MISSING_FIELD` (đã fix), nhưng tốt nhất validate ở FE.
4. **Email**: lowercase + trim trước khi gửi. Nếu không, server sẽ tự normalize nhưng tốn 1 round-trip ký tự thừa.
5. **Password**: 8–128 ký tự (BE enforce, register only). Login KHÔNG enforce length để tránh lộ thông tin.
6. **Response error format**: `{ error: { code: string, message: string } }`. Branch logic theo `code`, KHÔNG theo `message`.

## Auth endpoints

### POST `/api/auth/register`

**Body phải là**:
```ts
{
  name: string,        // 1-100 chars, trim trước
  email: string,       // RFC-ish, trim + lowercase
  password: string,    // 8-128 chars
}
```

**FE-side validation (trước khi POST)**:
| Field | Rule | Error message gợi ý |
|---|---|---|
| `name` | Required, ≥1 char sau trim, ≤100 | "Vui lòng nhập họ tên" |
| `email` | Required, khớp regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | "Email không hợp lệ" |
| `password` | Required, 8–128 chars | "Mật khẩu phải từ 8 đến 128 ký tự" |

**Response codes**:
- `201` → success, lưu `token` vào `localStorage`
- `400 MISSING_FIELD` → thiếu name
- `400 INVALID_INPUT` → email sai format HOẶC password không đạt length
- `409 EMAIL_ALREADY_USED` → email đã tồn tại
- `400 INVALID_INPUT` (từ middleware) → body không phải JSON object

### POST `/api/auth/login`

**Body phải là**:
```ts
{
  email: string,    // 1-254 chars, trim + lowercase
  password: string, // 1+ chars (server không enforce length để chống enumeration)
}
```

**FE-side validation**:
| Field | Rule | Error message gợi ý |
|---|---|---|
| `email` | Required, non-empty sau trim | "Vui lòng nhập email" |
| `password` | Required, non-empty | "Vui lòng nhập mật khẩu" |

**Response codes**:
- `200` → success, lưu `token`
- `400 MISSING_FIELD` → thiếu email/password
- `400 INVALID_INPUT` (middleware) → body không phải JSON object
- `401 INVALID_CREDENTIALS` → email/password sai (uniform message, không tiết lộ email có tồn tại)

## Sample FE code (TypeScript / axios)

```ts
// ❌ SAI — sẽ trả 400 INVALID_INPUT
await axios.post("/api/auth/login", { email: "x@x.vn", password: 123456 });

// ❌ SAI — sẽ trả 400 INVALID_INPUT
await axios.post("/api/auth/login", null);

// ✅ ĐÚNG
await axios.post("/api/auth/login", {
  email: email.trim().toLowerCase(),
  password: password,
});
```

```ts
// Generic helper — nên dùng cho mọi form submit
async function postJson<T>(url: string, body: object): Promise<T> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("INVALID_INPUT", "Body không hợp lệ");
  }
  try {
    const res = await axios.post<T>(url, body, {
      headers: { "Content-Type": "application/json" },
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data?.error) {
      throw new ApiError(err.response.data.error.code, err.response.data.error.message);
    }
    throw err;  // network error / etc.
  }
}
```

## Common pitfalls

| Vấn đề | Cách tránh |
|---|---|
| Gửi `password` kiểu number (từ input type="number") | Đổi sang `type="password"` (string) |
| Gửi `body: undefined` (khi form chưa nhập) | Validate required trước khi POST |
| Gửi `body: null` (từ FormData lỗi) | Check `body !== null` trước khi gửi |
| Email có space ở đầu/cuối do user dán | `.trim().toLowerCase()` trước khi gửi |
| Lưu `token` nhưng không xử lý khi hết hạn | Check `error.code === "TOKEN_INVALID"` → logout |

## Khi nào báo lỗi backend

Nếu bạn thấy BE trả **500 INTERNAL_ERROR** trong khi request body rõ ràng hợp lệ, đó là bug BE. Báo lại kèm:
- Request method + path
- Request body (đã mask password)
- Response body
- Stack trace từ server log (nếu bạn có quyền truy cập)

**Hiện tại (2026-10-08)**: Tất cả 500 trigger đã được fix — auth + body parser guard. BE có 87 unit test riêng cho auth validation, chạy `npm run test:auth` để verify.
