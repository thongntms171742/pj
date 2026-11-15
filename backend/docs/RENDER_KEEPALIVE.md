# Render Keep-Alive — Dùng External Cron để giữ BE không ngủ

> **Mục đích:** Backend deploy trên **Render Free** bị **spin down sau 15 phút**
> không có inbound traffic. Lần request kế tiếp phải chờ **30–60 giây** cold-start.
> Tài liệu này hướng dẫn dùng **external cron** gọi `/api/ping` mỗi 10 phút.
>
> **Repo liên quan:** `pj/backend` (BE), `christmas_UI/frontend` + `christmas_UI/mobile` (client).

---

## 1. Vì sao cần external cron?

| Cách | Có giữ được khi không ai mở web? | Đánh giá |
| :--- | :---: | :--- |
| `setInterval` trong trình duyệt (FE) | ❌ | Không có người dùng ⇒ timer không chạy ⇒ vẫn ngủ |
| `setInterval` trong app mobile | ❌ | Tương tự — app bị đóng là timer dừng |
| `setInterval` trong chính BE | ❌ | Service đã ngủ ⇒ code không chạy ⇒ vô dụng |
| **External cron (cron-job.org)** | ✅ | Chạy trên hạ tầng của bên thứ ba, luôn sống |

> ⚠️ Render chỉ tính "traffic" từ **inbound** request. Ping nội bộ (BE tự gọi
> chính nó) không reset được timer — và còn làm cháy quota 750 instance-hours/tháng.

---

## 2. Endpoint ping

```typescript
// backend/src/app.ts
app.get("/api/ping", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).type("text/plain").send("pong");
});
```

Đặc tính:
- **Không query DB** — không mở connection MongoDB, không tốn connection limit.
- **Không log** — không làm nhiễu log Render.
- **Không auth** — endpoint công khai, cố tình để cron gọi không cần token.
- **Không nằm sau catch-all 404** — route được đăng ký trước `app.use("/api/*")`.

### URL đầy đủ

```
https://christmas-8ca4.onrender.com/api/ping
```

### Kiểm tra nhanh

```bash
curl -i https://christmas-8ca4.onrender.com/api/ping
# HTTP/2 200
# content-type: text/plain; charset=utf-8
# pong
```

---

## 3. Chọn công cụ

| Tiêu chí | cron-job.org | UptimeRobot | Better Stack | GitHub Actions |
| :--- | :---: | :---: | :---: | :---: |
| Miễn phí | ✅ 100% | ✅ 50 monitor | ✅ 10 monitor | ✅ (repo public) |
| Chu kỳ ngắn nhất | **1 phút** | 5 phút | 3 phút | 5 phút |
| Cần thẻ tín dụng | ❌ | ❌ | ❌ | ❌ |
| Cảnh báo khi down | Email | ✅ Email | ✅ Email + Slack | ❌ (chỉ log) |
| **Tự tắt khi hỏng** | ⚠️ **>25 lỗi liên tiếp** | ❌ | ❌ | ⚠️ **60 ngày không commit** |
| Độ trễ (worst case) | Vài giây | Vài giây | Vài giây | ⚠️ **15–60 phút** |
| Trả lời "có lành không?" | ❌ | ✅ | ✅ | ❌ |

### ✅ Đánh giá chi tiết

**cron-job.org — chọn làm công cụ keep-alive chính**
- Chu kỳ tối thiểu **1 phút** ⇒ chọn 10 phút có biên an toàn rộng.
- **100% miễn phí**, không cần thẻ, không giới hạn job (ngoài fair-use).
- Timeout 30s, đọc tối đa 64KB — endpoint ping trả về 4 byte ⇒ không vấn đề.
- Cho phép custom header + basic auth ⇒ có thể gắn secret sau này.
- ⚠️ **Rủi ro cần biết:** job tự tắt sau **>25 lần lỗi liên tiếp**. Nếu Render
  deploy lỗi kéo dài, ping sẽ fail liên tục ⇒ job bị disable ⇒ service lại ngủ.
  → **Cần kiểm tra lại định kỳ** (xem mục 7).

**UptimeRobot — chọn làm "monitoring + alerting" bổ sung**
- Cho **cảnh báo email khi BE down** — cron-job.org không có.
- Monitor chạy ở nhiều region ⇒ phát hiện lỗi mạng/thuật toán tốt hơn.
- Free plan: 50 monitor, 5 phút/lần ⇒ 5 phút vẫn nằm trong cửa sổ 15 phút.
- Timeout cấu hình được (mặc định 30s) ⇒ đủ cho cold-start 30–60s? **Cần nâng lên 60s.**

**GitHub Actions — ❌ KHÔNG dùng cho việc này**
- Interval tối thiểu 5 phút, và **schedule có thể trễ 15–60 phút** khi GitHub bận.
  Một lần trễ >15 phút ⇒ service ngủ ⇒ đúng thứ ta đang cố tránh.
- Job có thể **bị drop** hoàn toàn khi queue cao tải.
- Workflow bị **tự disable sau 60 ngày repo không có activity** — repo đang phát triển
  thì không sao, nhưng đây là điểm chết âm thầm.
- Public repo mới được free (private repo GitHub Free = 2.000 phút/tháng, cạn kiều).

**Better Stack — không chọn**
- 3 phút/lần là tốt hơn UptimeRobot, nhưng chỉ 10 monitor và cần signup qua
  Slack/email phức tạp hơn. Không có lợi thế rõ so với cron-job.org cho
  bài toán ping đơn giản.
- (Nếu sau này cần log management + APM + on-call thì đáng cân nhắc.)

---

## 4. Kết luận — kiến trúc 2 lớp

```
┌─────────────────────────────────────────────────────────────┐
│  cron-job.org (keep-alive)        every 10 min              │
│  → GET https://christmas-8ca4.onrender.com/api/ping         │
│      mục đích: giữ container sống                            │
├─────────────────────────────────────────────────────────────┤
│  UptimeRobot (monitoring)        every 5 min               │
│  → GET .../api/ping                                          │
│      mục đích: phát hiện down + gửi email cảnh báo          │
├─────────────────────────────────────────────────────────────┤
│  FE / Mobile (best-effort)       every 8 min               │
│  → GET .../api/ping (chỉ khi app đang mở)                   │
│      mục đích: giữ socket chat không bị đứt                 │
└─────────────────────────────────────────────────────────────┘
```

Ba lớp đều ping **cùng một endpoint** `/api/ping` ⇒ chỉ cần 1 URL duy nhất.

---

## 5. Thiết lập cron-job.org

1. Vào <https://cron-job.org> → **Create account** (email + password, miễn phí).
2. **Create new cron job**:
   | Trường | Giá trị |
   | :--- | :--- |
   | Title | `BYC Backend Keep-Alive` |
   | URL | `https://christmas-8ca4.onrender.com/api/ping` |
   | Schedule | `Every 10 minutes` |
   | Execution type | `GET` |
   | Notifications | Email on error (tuỳ chọn) |
3. **Create job** → job chạy ngay lần đầu.
4. Xem tab **Execution Log** để xác nhận response `200` + body `pong`.

> 💡 **Bonus:** bật **Cron Job Notifications** (email) để nhận cảnh báo khi
> ping fail — đây chính là "monitoring" mà cron-job.org thiếu so với UptimeRobot.

### IP allowlist (tuỳ chọn — khuyến nghị)

cron-job.org gọi từ **5 IP cố định**. Nếu muốn chặn mọi truy cập khác vào
`/api/ping`, thêm middleware allowlist ở BE:

```typescript
// backend/src/app.ts
const CRON_ALLOWED_IPS = new Set([
  // 5 IP của cron-job.org — lấy từ cron-job.org/en/faq.html
  "…",
]);

app.get("/api/ping", (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  if (CRON_ALLOWED_IPS.size > 0 && !CRON_ALLOWED_IPS.has(ip)) {
    res.status(403).send("forbidden");
    return;
  }
  res.set("Cache-Control", "no-store");
  res.status(200).type("text/plain").send("pong");
});
```

> ⚠️ Render có thể đặt IP thật sau proxy ⇒ nhớ dùng `req.ip` (đã cấu hình
> `trust proxy`) chứ không phải `req.socket.remoteAddress`.

---

## 6. Thiết lập UptimeRobot (monitoring + cảnh báo)

1. Vào <https://uptimerobot.com> → Register (miễn phí, không cần thẻ).
2. **+ Add New Monitor**:
   | Trường | Giá trị |
   | :--- | :--- |
   | Monitor Type | `HTTP(s)` |
   | Friendly Name | `BYC Backend (Render)` |
   | URL | `https://christmas-8ca4.onrender.com/api/ping` |
   | Monitoring Interval | `5 minutes` (ngắn nhất của free plan) |
   | **Monitor Timeout** | **`60 seconds`** ← quan trọng cho cold-start |
   | Alert Contacts | email của bạn |
3. **Create Monitor**.
4. Kiểm tra sau 30 phút: Render logs phải có `GET /api/ping` mỗi 5 phút, và
   response time **vài trăm ms** (không phải 30–60s) — nếu thấy ~1 phút ⇒
   service đang bị cold-start ⇒ cron-job.org chưa hoạt động.

> 💡 **Keyword monitoring (tuỳ chọn):** Advanced → Keyword = `pong`, type
> *"alert when keyword does not exist"*. Bảo đảm endpoint trả 200 thật sự.

---

## 7. Checklist vận hành

- [ ] `curl -i https://christmas-8ca4.onrender.com/api/ping` ⇒ `200 pong`
- [ ] cron-job.org job tồn tại, interval = 10 phút, log có lần chạy thành công
- [ ] UptimeRobot monitor = `Up`, response time < 1s
- [ ] Render logs có `GET /api/ping` đều đặn (không phải chỉ khi có user)
- [ ] Cảnh báo email của UptimeRobot đã bật (test bằng cách tắt service tạm)
- [ ] ⚠️ **Kiểm tra cron-job.org job mỗi 2–4 tuần** — job tự tắt sau 25 lỗi liên tiếp
- [ ] Ghi nhận ngày deploy → Render cold-start sau mỗi lần deploy vẫn xảy ra
      (cron **không** ngăn được cold-start sau deploy, chỉ ngăn được idle-spin-down)

### Dấu hiệu service đang bị ngủ (cold-start)

```bash
# Nếu mất >2s ⇒ service vừa cold-start
curl -o /dev/null -s -w "%{time_total}\n" https://christmas-8ca4.onrender.com/api/ping
```

---

## 8. Ảnh hưởng tới quota Render

- Render Free: **750 instance-hours / workspace / tháng** (tháng 31 ngày = 744h).
- Giữ **1** service sống 24/7 tốn ~744h ⇒ vừa đủ, **dư ~6h**.
- Giữ **2** service sống 24/7 cần ~1.490h ⇒ **vượt quota ⇒ Render suspend tất cả**
  tới đầu tháng sau.
- → Chỉ nên giữ **1** service BE sống. Nếu cần thêm service thứ 2, cho nó ngủ
  ngoài giờ cao điểm (VD: ping 8h–20h ⇒ ~372h).

---

## 9. Liên quan

| File | Vai trò |
| :--- | :--- |
| `backend/src/app.ts` | Đăng ký route `/api/ping` |
| `frontend/src/services/socket.ts` | Keep-alive best-effort từ trình duyệt (8 phút) |
| `mobile/src/services/socket.ts` | Keep-alive best-effort từ app (8 phút) |
| `mobile/src/api/index.ts` | `healthApi.ping()` |
