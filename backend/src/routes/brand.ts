import { Router, type Response } from "express";
import { BRAND_LOGO_PNG, BRAND_LOGO_SVG } from "../assets/brandLogo";

const router = Router();

function setBrandHeaders(res: Response, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

// Public PNG logo — dùng ổn định cho Gmail/Outlook (email client chặn SVG).
router.get("/logo.png", (_req, res) => {
  setBrandHeaders(res, "image/png");
  res.status(200).send(BRAND_LOGO_PNG);
});

// Public SVG logo — bản vector gốc từ frontend.
router.get("/logo.svg", (_req, res) => {
  setBrandHeaders(res, "image/svg+xml; charset=utf-8");
  res.status(200).send(BRAND_LOGO_SVG);
});

export default router;
