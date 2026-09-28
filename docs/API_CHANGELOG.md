# API CHANGELOG

Track changes to the API contract over time to ensure synchronization between Backend and Frontend.

---
## [Template] YYYY-MM-DD

### Changed

**Method /api/endpoint**

**Added**:
- field: type

**Old**:
```json
{ }
```

**New**:
```json
{ }
```

## 2026-09-28

### Security Fix

**POST /api/products**

Fixed seller authorization.

**Before**:
Any authenticated user (even buyers) could reach product creation.

**After**:
Only users with `roles` including `"seller"` and `sellerProfile.status = "active"` can create products.

**HTTP 403**:
```json
{
  "error": "SELLER_NOT_APPROVED"
}
```
