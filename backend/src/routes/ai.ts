import { Router } from "express";
import { analyzeListing, searchWithAi, getRecommendations } from "../controllers/aiController";

const router = Router();
router.post("/search", searchWithAi);
router.post("/analyze-listing", analyzeListing);
router.post("/recommendations", getRecommendations);

export default router;
