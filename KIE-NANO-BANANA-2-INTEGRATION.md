# KIE API – Nano Banana 2 integration (Build Your Christmas)

> Updated sau refactor: gộp `TreeDesign` + `AIDesign` thành `Design` duy nhất; dùng `TreeProduct.coverImage` + `TreeProduct.description` + customer `prompt` để compose AI prompt.

## What changed

### Service layer — `backend/src/services/ai/googleImageService.ts`
- Thay thế provider Gemini cũ bằng KIE async task API.
- Flow:
  1. `composePrompt({ treeProduct, customerPrompt })` → trộn `description` (form/decor/material) của `TreeProduct` với `prompt` của khách, ép style "studio product photography, realistic".
  2. Lấy `TreeProduct.coverImage` làm reference image (URL gốc trên Cloudinary).
  3. Gọi `POST https://api.kie.ai/api/v1/jobs/createTask` với `model: "nano-banana-2"`, `input.image_input = [coverImage]`, `input.prompt = composedPrompt`, `input.aspect_ratio = "1:1"`.
  4. Poll `GET /api/v1/jobs/recordInfo?taskId=...` cho tới khi state ∈ {`success`, `fail`}.
  5. Download buffer ảnh từ URL trả về → upload Cloudinary → lưu `imageUrl` + `imagePublicId` lên `Design`.
- Status machine của `Design`: `DRAFT → AI_PENDING → AI_COMPLETED | FAILED → CONFIRMED`.
- Helper `composePrompt` được export để dùng cho chatbot và test.

### Controller layer — `backend/src/controllers/designController.ts`
- Thay thế `aiDesignerController` (đã bị purge).
- Endpoint mới:
  - `POST /api/designs/:id/generate-image` — tạo task KIE, set `status = AI_PENDING`, lưu `lastError = null`, trả về `{ designId, status, imageUrl, imagePublicId, taskId }`.
  - `POST /api/designs/:id/confirm` — sau khi `AI_COMPLETED`, đánh dấu `CONFIRMED` và snapshot pricing & delivery option.
- Authorization: owner hoặc admin (`isAdmin`); `Design.ownerId` là ObjectId hoặc `null` (guest draft).
- Validation: `baseTreeProductId` phải tồn tại và active; `prompt` ≤ 1000 chars.

### Models
- `Design` (mới, thay thế `TreeDesign` + `AIDesign`): schema tối giản gồm `name, slug, year, baseTreeProductId, prompt, imageUrl, imagePublicId, status, lastError, pricingSnapshot, deliveryOption, isPublic, duplicatedFrom, ownerId, previewImage`.
- Bỏ hoàn toàn: `styleId`, `accessories[]`, `isPreset`, `isPersonalizable`, `maxQtyBySize`, `personalization*`.
- `TreeProduct` (giữ nguyên) chứa `description` (form/decor/material) và `coverImage` (URL Cloudinary).

## Configure Render
1. Tạo KIE API key tại https://kie.ai/api-key.
2. Mở Render → Web Service → Environment.
3. Thêm biến `KIE_API_KEY` với giá trị secret key. **Không** đưa key này vào frontend, Git, hay chat.
4. Save & deploy/restart service.
5. `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_IMAGE_MODEL` không còn dùng cho image generation nữa; có thể gỡ nếu xác nhận không còn feature nào khác dùng tới.
6. Đảm bảo Cloudinary env vars (`CLOUDINARY_*`) còn cấu hình — ảnh sinh ra được upload Cloudinary chứ không phụ thuộc URL tạm của KIE.

## Cấu trúc data flow mới

```
Customer
  ↓ chọn TreeProduct (Yêu Thương, …) + viết prompt
POST /api/designs                      → tạo Design (DRAFT, ownerId = user._id)
POST /api/designs/:id/generate-image   → service composePrompt + gọi KIE
                                          ↓
                                       poll recordInfo → success
                                          ↓
                                       download → upload Cloudinary
                                          ↓
                                       set Design.imageUrl, status = AI_COMPLETED
POST /api/designs/:id/confirm          → status = CONFIRMED
                                          ↓
POST /api/cart/items                   → thêm Design vào Cart với deliveryOption
```

## Test
- `cd backend`
- `npm install`
- `npm run build`
- `npm run test:all` (test:all bao gồm `design.test.ts` xác nhận `composePrompt` đúng format và enum status hoạt động)

## Notes
- KIE tính credit riêng. Xem giá tại https://kie.ai/pricing và log tại https://kie.ai/logs.
- URL output của KIE chỉ tồn tại tạm (KIE docs ghi ~14 ngày); implementation này download và upload Cloudinary.
- Polling timeout 8 phút. Nếu timeout, `Design` vẫn còn trong DB với `status` và `lastError` được lưu — user có thể retry.
- Model ID: `nano-banana-2`, output mặc định PNG, 1K, square 1:1.
- `composePrompt` luôn kết thúc bằng câu anchor: *"Studio product photography, realistic textures, soft natural light, festive Christmas mood, no human, no watermark."* để KIE trả ra ảnh đúng style product.
