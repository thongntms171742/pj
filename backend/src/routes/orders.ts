import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  createOrderShipment,
  getOrderShipment,
} from "../controllers/orderController";

const router = Router();

router.get("/", requireAuth, getMyOrders);
router.post("/", requireAuth, createOrder);
router.get("/:id", requireAuth, getOrderById);
router.get("/:id/shipment", requireAuth, getOrderShipment);
router.post("/:id/shipment", requireAuth, createOrderShipment);
router.patch("/:id/status", requireAuth, updateOrderStatus);

export default router;