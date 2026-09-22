import { Router } from "express";
import { getOrders, getOrderById, createOrder, updateOrderStatus, getOrderShipment } from "../controllers/orderController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getOrders);
router.post("/", requireAuth, createOrder);
router.get("/:id", requireAuth, getOrderById);
router.get("/:code/shipment", getOrderShipment);
router.patch("/:code/status", requireAuth, updateOrderStatus);

export default router;
