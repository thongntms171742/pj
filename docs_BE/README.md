# Build Your Christmas — Documentation

> **Source of Truth**: `backend/src/` (Express + TypeScript + Mongoose).
> Docs này mô tả hợp đồng API cho FE team. Nếu docs và code lệch → **tin code**.

## 📖 Đọc theo thứ tự này (cho FE mới onboard)

| # | File | Mục đích | Đọc khi nào |
|---|------|----------|--------------|
| 1 | [ONBOARDING.md](./ONBOARDING.md) | Setup + checklist bắt buộc trước khi code | Ngày đầu tiên |
| 2 | [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) | Env config, test accounts, Christmas flow chính | Ngày đầu tiên |
| 3 | [API_MATRIX.md](./API_MATRIX.md) | Status từng endpoint (BE ready, FE pending) | Khi bắt đầu tích hợp |
| 4 | [API_CONTRACT.md](./API_CONTRACT.md) | Full request/response cho 44 endpoints | Khi implement call API |
| 5 | [openapi.yaml](./openapi.yaml) | OpenAPI 3.0.3 spec (dùng để gen client SDK) | Khi gen client |
| 6 | [AUTH_SPEC.md](./AUTH_SPEC.md) | Register/login/avatar + role matrix (buyer/admin) | Khi làm auth flow |
| 7 | [ENUMS.md](./ENUMS.md) | Tất cả enums (TreeSize, StyleCode, OrderStatus, ...) | Khi handle enum/state machine |
| 8 | [ERROR_CODES.md](./ERROR_CODES.md) | 47 error codes + FE action mapping | Khi viết error handler |
| 9 | [API_INTEGRATION_CHECKLIST.md](./API_INTEGRATION_CHECKLIST.md) | TypeScript axios helper + regex/validation rules | Khi viết API client |
| 10 | [MVP_FE_BE_DOCUMENTATION.md](./MVP_FE_BE_DOCUMENTATION.md) | FE UI/UX coverage + pages mapped to API | Khi build UI |
| 11 | [API_CHANGELOG.md](./API_CHANGELOG.md) | Breaking changes history | Khi cần hiểu context |

## 🗂 Tham khảo thêm (dành cho AI agent mới)

| File | Mục đích |
|------|----------|
| [AI_CONTEXT.md](./AI_CONTEXT.md) | BE architecture overview - cho AI agent onboard |
| [CHANGELOG_AI.md](./CHANGELOG_AI.md) | AI changelog (lịch sử pivot marketplace → Christmas) |
| [AGENTS.md](./AGENTS.md) | AI coding rules cho dự án này |
| [ADMIN_TREE_PRODUCT_FORM.md](./ADMIN_TREE_PRODUCT_FORM.md) | ASCII mockup Shopee-style admin form (parent + size matrix) |

## ⚠️ Folder Archive (KHÔNG dùng khi integrate)

| Folder | Mục đích |
|--------|----------|
| [_archive/](./_archive/README.md) | Lưu trữ thông tin legacy `thriftit!` marketplace (seller/products/AI/commission/Ledger) đã bị xóa khỏi BE Christmas pivot 2026-10-07. **KHÔNG ĐỌC** khi build UI - chỉ tham khảo context lịch sử. |

## 🚀 Quick Start (5 phút)

```bash
# 1. Start BE (terminal 1)
cd backend
npm install
npm run seed -- --confirm-seed    # seed 3 trees, 6 styles, ~25 accessories, 3 presets, 1 admin, 1 buyer
npm run dev                         # BE chạy ở http://localhost:4000

# 2. Start FE (terminal 2)
cd frontend
npm install
npm run dev                         # FE chạy ở http://localhost:5173

# 3. Login test
# Admin: admin@buildyourchristmas.vn / SEED_ADMIN_PASSWORD (xem backend/.env)
# Buyer: buyer@buildyourchristmas.vn / SEED_BUYER_PASSWORD (xem backend/.env)
```

## 📊 Stats (2026-10-08 audit)

- **13 docs files** (~284 KB)
- **44 endpoints** documented (match BE routes)
- **25 schemas** trong OpenAPI
- **47 error codes** Christmas-specific
- **0** legacy `FLAT_PACK` references
- **0** legacy `sellerProfile` / `commissionRate` references (chỉ còn trong archive)
- **0** legacy `/api/products` / `/api/sellers` / `/api/ai` references

## 🔄 Khi BE update code → update docs

Nếu BE team thay đổi endpoint/schema/enum:
1. Update code trước.
2. Update `API_CONTRACT.md` (markdown).
3. Update `openapi.yaml` (OpenAPI 3.0.3).
4. Update `ENUMS.md` nếu thêm/sửa enum.
5. Update `ERROR_CODES.md` nếu thêm error code.
6. Update `API_MATRIX.md` (BE Status cột).
7. Update `API_CHANGELOG.md` (entry mới).
8. Update `AI_CONTEXT.md` (nếu architecture đổi).

Nếu chỉ là internal refactor (không đổi contract) → chỉ update `AI_CONTEXT.md` + `CHANGELOG_AI.md`.

## 📞 Liên hệ

- BE: ...
- FE: ...
- Designer: ...
