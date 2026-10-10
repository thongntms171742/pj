import { Router } from "express";
import { getTrees } from "../../controllers/catalogController";
import { logWarn } from "../../utils/logger";
import type { Request } from "express";

// ── Legacy catalog routes (back-compat) ──────────────────────────────────────
// The 3-tier tree-product/codes/variants API replaced these endpoints. They
// are kept mounted so older FE builds keep working but are tagged
// @deprecated and log a warning so we can spot stale clients in prod logs.
//
// REMOVAL: 2026-12-01 — after confirming no FE build still calls these.

const router = Router();

router.get("/trees", (req: Request, res, next) => {
  logWarn("[legacy] GET /api/catalog/trees called", {
    ip: req.ip,
    ua: req.headers["user-agent"],
  });
  next();
}, getTrees);

export default router;
