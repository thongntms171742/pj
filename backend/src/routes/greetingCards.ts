import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { generateCard } from "../controllers/greetingCardController";

const router = Router();

router.post("/generate", requireAuth, generateCard);

export default router;
