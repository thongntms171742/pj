import { Router } from "express";
import { getSellers, getSellerById } from "../controllers/sellerController";

const router = Router();

router.get("/", getSellers);
router.get("/:idOrHandle", getSellerById);

export default router;
