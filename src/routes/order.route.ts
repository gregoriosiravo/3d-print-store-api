import { Router } from "express";
import { OrderController } from "../controllers/order.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();
const orderController = new OrderController();

// All order routes require authentication
router.post(
  "/orders/accept-quote",
  authenticate,
  orderController.acceptQuote.bind(orderController),
);
router.get(
  "/orders",
  authenticate,
  orderController.getUserOrders.bind(orderController),
);

export default router;
