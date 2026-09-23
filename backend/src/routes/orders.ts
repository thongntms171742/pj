import { Router } from "express";
import {
  getOrders,
  getSellerOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  getOrderShipment,
  createOrderShipment,
} from "../controllers/orderController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getOrders);
router.get("/seller", requireAuth, getSellerOrders);
router.post("/", requireAuth, createOrder);
router.get("/:id", requireAuth, getOrderById);
router.get("/:code/shipment", getOrderShipment);
router.post("/:code/shipment", requireAuth, createOrderShipment);
router.patch("/:code/status", requireAuth, updateOrderStatus);

export default router;
