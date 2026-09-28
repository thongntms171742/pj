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

### Authorization Audit Fixes

**GET /api/orders/:code/shipment**
Fixed IDOR (Insecure Direct Object Reference) and PII Leak.
**Before**: Publicly accessible, exposing buyer's shipping address to anyone with the order code.
**After**: Requires JWT (`requireAuth`). Only the buyer, a seller participating in the order, or an admin can access this endpoint.

**PATCH /api/orders/:code/status**
Fixed IDOR and State-Machine Bypass.
**Before**: Any authenticated user could change the status of any order to any state.
**After**:
- **IDOR Protection**: Only the buyer, a participating seller, or an admin can update the status.
- **State-Machine Protection**:
  - Buyers can only transition to `CANCELLED` or `COMPLETED`.
  - Sellers cannot directly transition to `DELIVERING`, `DELIVERED`, or `COMPLETED` (must be handled by shipment mock or buyer).
