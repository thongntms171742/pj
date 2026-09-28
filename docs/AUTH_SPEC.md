# Authentication Specification

## Login

**POST /api/auth/login**

**Request**:
```json
{
  "email": "seller@gmail.com",
  "password": "Password123"
}
```

**Response**:
```json
{
  "token": "JWT",
  "user": {
    "_id": "...",
    "name": "...",
    "email": "...",
    "roles": ["buyer"],
    "sellerStatus": "NONE"
  }
}
```

*(Frontend uses `localStorage.setItem("token", response.token);` and sends `Authorization: Bearer <JWT>`)*

## Roles

Available roles: `buyer`, `seller`, `admin`

### Role-Based Access Matrix

| Endpoint | Buyer | Seller | Admin |
| :--- | :---: | :---: | :---: |
| GET products | ✅ | ✅ | ✅ |
| POST products | ❌ | APPROVED | Admin |
| GET seller orders | ❌ | ✅ | ✅ |
| Approve seller | ❌ | ❌ | ✅ |
| Approve product | ❌ | ❌ | ✅ |
| Complete order | Buyer | ❌ | ✅ |
| COD collect | ❌ | ❌ | ✅ |

*(Frontend uses this for UI/UX rendering. Backend always enforces validation independently).*
