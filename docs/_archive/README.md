# Archived Docs - Build Your Christmas

> **Muc dich**: Luu tru cac phan legacy cua `thriftit!` marketplace ma KHONG con ap dung cho Build Your Christmas.
>
> **Khong su dung noi dung archive nay** khi integrate FE voi BE Christmas. BE hien tai KHONG co cac endpoint/model/role sau:
> - `/api/products/*`, `/api/sellers/*`, `/api/ai/*`
> - `role: "seller"`, `sellerProfile`, `commissionRate`, `commissionAmount`
> - `Ledger`, `PlatformFeeConfig`, `Review`, `Product`, `Category`, `Favorite`
> - `pendingListings`, `soldProducts`, `platformProfit`, `pendingSellers`
>
> **Source of truth cho Christmas**: `backend/src/` (code that).

---

## Archive 1: Legacy marketplace endpoints (API_CHANGELOG.md entries)

### 2026-09-29 (marketplace era) - Removed endpoints (kept for history)

Nhóm **Sellers / Products / Reviews** (da xoa file controller + route):
- `GET/POST/PATCH/DELETE /api/products/*` (tat ca)
- `GET/POST/PATCH /api/sellers/*` (tat ca)
- `POST /api/products/:id/reviews`
- `GET /api/sellers/:idOrHandle/reviews`

Nhóm **Marketplace cart merge**:
- `POST /api/cart/merge`
- `POST /api/auth/cart/merge`

Nhóm **Seller application flow**:
- `POST /api/auth/seller/apply`
- `GET /api/admin/pending-sellers`
- `PATCH /api/admin/sellers/:id/approve`
- `PATCH /api/admin/sellers/:id/reject`
- `PATCH /api/admin/sellers/:id/commission-rate`
- `PATCH /api/admin/users/:id/approve-seller` (legacy)
- `PATCH /api/admin/users/:id/reject-seller` (legacy)

Nhóm **Listing moderation**:
- `GET /api/admin/pending-listings`
- `PATCH /api/admin/listings/:id/approve`
- `PATCH /api/admin/listings/:id/reject`

Nhóm **AI** (Gemini endpoints - da xoa):
- `POST /api/ai/search`
- `POST /api/ai/analyze-listing`
- `POST /api/ai/recommendations`

Nhóm **Legacy order**:
- `GET /api/orders/seller`
- `PATCH /api/orders/:code/status` (doi thanh `:id`)
- `POST /api/orders/:code/shipment` (doi thanh `:id`)
- `POST /api/payments/:code/cod-collect` (COD xu ly trong `POST /api/orders`)

### Legacy error codes (REMOVED)
- `SELLER_NOT_APPROVED`, `SELLER_HANDLE_TAKEN`, `SELLER_SHOP_NAME_TAKEN`, `SELLER_ALREADY_APPROVED`
- `PRODUCT_NOT_FOUND`, `PRODUCT_NOT_AVAILABLE`, `PRODUCT_OUT_OF_STOCK`, `PRODUCT_TITLE_REQUIRED`, `PRODUCT_PRICE_REQUIRED`, `PRODUCT_CONDITION_REQUIRED`, `PRODUCT_SIZE_REQUIRED`, `PRODUCT_QUANTITY_INVALID`, `PRODUCT_SIZE_DATA_INVALID`, `PRODUCT_ALREADY_NOT_FOR_SALE`
- `SELF_PURCHASE_NOT_ALLOWED`, `QUANTITY_EXCEEDS_STOCK`
- `ORDER_BUYER_NOT_PARTICIPANT`, `ORDER_SELLER_CANNOT_DELIVER`
- `REVIEW_RATING_INVALID`, `REVIEW_NOT_ALLOWED`, `REVIEW_ALREADY_EXISTS`
- `AI_NOT_CONFIGURED`, `AI_UPSTREAM_ERROR`, `AI_QUERY_INVALID_LENGTH`, `AI_IMAGE_INVALID`, `AI_IMAGE_TYPE_INVALID`, `AI_QUERY_OR_IMAGE_REQUIRED`, `AI_RECOMMENDATIONS_UNAVAILABLE`
- `COMMISSION_RATE_INVALID`, `SELLER_NOT_FOUND`

---

## Archive 2: Legacy stats shape (old marketplace admin dashboard)

> Christmas CURRENT shape: `totalOrders, pendingOrders, completedOrders, totalUsers, totalDesigns, designsShared, revenue, aov, personalizationCount, ordersByStatus, lowStock { accessories, trees }`
>
> Do NOT use the following shape from old marketplace era.

```json
{
  "stats": {
    "pendingListings": 12,
    "soldProducts": 240,
    "totalOrders": 1024,
    "totalUsers": 5000,
    "totalSellers": 87,
    "platformProfit": 12345678
  }
}
```

---

## Archive 3: Legacy models (NEVER use in Christmas code)

- `Product.ts`, `Category.ts`, `SellerProfile.ts`, `Review.ts`
- `Ledger.ts` (double-entry accounting) - NOT IMPLEMENTED in Christmas
- `PlatformFeeConfig.ts` - NOT IMPLEMENTED in Christmas
- `Conversation.ts`, `Message.ts`, `Favorite.ts`, `UserView.ts`, `UserLike.ts`, `Dispute.ts`

---

## Archive 4: Legacy commission flow (October 2026 era)

**`PATCH /api/admin/sellers/:id/commission-rate`** (REMOVED in Christmas pivot 2026-10-07)
- Admin cap nhat ty le hoa hong cho tung seller (0..1).
- BE doc `seller.sellerProfile.commissionRate` (default 0.1) va snapshot vao `OrderItem.commissionRate`.
- Aggregate `order.platformFee` = tong `commissionAmount` cua cac items.

> Christmas KHONG co commission vi single-brand (khong co seller concept). Tat ca gia di vao `order.subtotal` (khong co `platformFee`).

---

## Archive 5: Legacy flow details (COD/Online pre-Christmas)

### Pre-Christmas `POST /api/orders` flow:
- COD Orders: Immediately transitioned to `CONFIRMED`, stock decremented immediately (`quantity = quantity - item.quantity`; if 0, `status = 'sold'`), and sends notifications to both buyer and seller.
- Card / Online Orders: Initial status `PENDING_PAYMENT`, temporarily places items on hold (`status = 'reserved'`, `reservedUntil = Date.now() + 30m`, `reservedByOrderId = order._id`).

### Pre-Christmas `POST /api/payments/checkout`:
- Advances order `PENDING_PAYMENT -> PAID -> CONFIRMED`.
- Finalizes inventory decrement (marks remaining stock `active` or `sold`), clears reservation holds, and sends notifications to buyer and seller.
- Writes to `Ledger` to debit `PLATFORM_CASH` and credit `PLATFORM_REVENUE` (based on `PlatformFeeConfig`) and `SELLER_PAYABLE`.

### Pre-Christmas shipment:
- `POST /api/orders/:code/shipment` - Seller generates shipping label (`provider`: GHTK, unique tracking number `GHTK...`, tracking URL, estimated delivery, and pickup info). Moves order to `SHIPPING`.

### Christmas CURRENT flow (correct):
- `POST /api/orders`: atomic stock reservation, snapshot design into order. COD -> `CONFIRMED` ngay, online -> `PENDING_PAYMENT`. No seller involved.
- `POST /api/payments/checkout`: chi flip status, KHONG tru kho (da tru luc createOrder), KHONG notify seller.
- `POST /api/orders/:id/shipment` (admin only): Gen `BYC#######` tracking, `Build Your Christmas - HCM Delivery` provider, khong co GHTK.

---

## Archive 6: Legacy seller/buyer side-features (NEVER use)

- **Seller Application Workflow**: `POST /api/auth/seller/apply` - REMOVED.
- **Product Creation Guardrails**: `POST /api/products` requires `user.sellerStatus === "APPROVED"` - REMOVED (no products endpoint).
- **mapProduct dual aliases**: `name`/`shopName`, `avatar`/`avatarUrl`, etc. - REMOVED (no products).
- **sizeQuantities / sizePriceDeltas** in `Product.ts` - REMOVED (no products).
- **Reviews**: `POST /api/products/:id/reviews` - REMOVED (Christmas MVP no reviews).
- **AI endpoints**: `/api/ai/search`, `/api/ai/analyze-listing` - REMOVED.

---

## Note ve encoding

`docs/CHANGELOG_AI.md` duoc save UTF-8 (verified bang Python `open(..., 'utf-8-sig')`). Mot so editor/IDE co the hien thi ky tu Viet sai (mojibake) neu khong detect dung encoding - nhung **bytes thuc te la UTF-8 clean**. FE nen:
- VSCode: auto-detect, OK.
- Notepad++: Encoding > UTF-8.
- Cursor: da biet issue display, code bytes van UTF-8 dung.

Tat ca cac file `.md` trong `docs/` deu la UTF-8. Neu gap mojibake, kiem tra encoding settings cua editor truoc khi bao loi.

---

## Why this archive exists

Khi FE team copy nguyen folder `docs/` de onboard, ho co the:
1. Doc `API_CHANGELOG.md` thay cac endpoint legacy (seller/products/AI) - SE HIEN NHIEU - nhung BE khong co.
2. Doc `AI_CONTEXT.md` co 250+ dong noi ve marketplace.
3. Doc `CHANGELOG_AI.md` co 365 dong changelog marketplace.

=> File `_archive/README.md` nay giai thich: **tat ca noi dung archive la LICH SU, khong ap dung cho code hien tai**. FE can dich theo code (`backend/src/`) lam source of truth.
