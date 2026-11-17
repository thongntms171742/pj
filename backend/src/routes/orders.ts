import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  createOrderShipment,
  updateOrderShipment,
  getOrderShipment,
  updateOrderShippingAddress,
} from "../controllers/orderController";

import { getOrderReviewableItemsHandler } from "../controllers/reviewController";

const router = Router();

router.get("/", requireAuth, getMyOrders);
router.post("/", requireAuth, createOrder);
router.get("/:id", requireAuth, getOrderById);
router.get("/:orderId/reviewable-items", requireAuth, getOrderReviewableItemsHandler);
router.get("/:id/shipment", requireAuth, getOrderShipment);
router.post("/:id/shipment", requireAuth, createOrderShipment);
router.patch("/:id/shipment", requireAuth, updateOrderShipment);
router.patch("/:id/shipping-address", requireAuth, updateOrderShippingAddress);
router.patch("/:id/address", requireAuth, updateOrderShippingAddress);
router.patch("/:id/status", requireAuth, updateOrderStatus);

export default router;