import { Router } from "express";
import { getDesignAccessories } from "../controllers/catalogController";

const router = Router();

// ── Tree Customizer — public design accessory catalog ────────────────────────
// GET /api/design-accessories
//
// Collection phụ kiện riêng cho Customizer: phụ kiện THIẾT KẾ (không phải
// hàng hóa thương mại) ⇒ không có tồn kho, giá tính theo từng slot.
//
// Query: ?slotType=ball (lọc theo loại slot)
//
// FE fallback: nếu endpoint trả 404/403/405 ⇒ FE tự gọi
// `GET /api/catalog/accessories` (collection cũ) ⇒ endpoint này không bắt buộc.
router.get("/", getDesignAccessories);

export default router;
