/**
 * knowledge.routes.ts — quản lý kho tri thức (admin).
 * Mount tại /api/chat/admin/knowledge.
 *
 * Yêu cầu: đăng nhập + role admin.
 */

import { Router } from "express";
import { requireAuth, requireAdmin } from "../../../middleware/auth";
import * as knowledge from "../controllers/knowledge.controller";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/", knowledge.listKnowledge);
router.get("/:id", knowledge.getKnowledge);
router.post("/", knowledge.createKnowledge);
router.put("/:id", knowledge.updateKnowledge);
router.delete("/:id", knowledge.archiveKnowledge);

export default router;
