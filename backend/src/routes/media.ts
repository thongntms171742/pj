import { Router } from "express";
import {
  listMedia,
  getHeroMedia,
  getBackgroundMusic,
} from "../controllers/mediaController";

const router = Router();

// GET /api/media?placement=STORY_FEED&limit=20
router.get("/", listMedia);
// GET /api/media/hero
router.get("/hero", getHeroMedia);
// GET /api/media/background-music
router.get("/background-music", getBackgroundMusic);

export default router;
