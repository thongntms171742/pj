# Error Codes

Standardized business error codes.

### Unified Error Response Format
```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Không tìm thấy sản phẩm"
  }
}
```

### Error Code Mapping

| Error | HTTP | FE action |
| :--- | :---: | :--- |
| `INVALID_INPUT` | 400 | Show field error |
| `PRODUCT_NOT_FOUND` | 404 | Show not found |
| `PRODUCT_OUT_OF_STOCK` | 400 | Refresh stock |
| `UNAUTHORIZED` | 401 | Redirect login |
| `FORBIDDEN` | 403 | Show permission error |
| `SELLER_NOT_APPROVED` | 403 | Go seller application |
| `DUPLICATE_REVIEW` | 409 | Show already reviewed |

*(Frontend must handle logic based on `code`, not hardcoded text `message`)*
