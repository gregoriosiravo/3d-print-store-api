import { Request, Response } from "express";
import { OrderService } from "../services/order.service";

const orderService = new OrderService();

export class OrderController {
  /**
   * Accept quote and create order
   */
  async acceptQuote(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { quoteId, shippingAddress } = req.body;
      if (!quoteId) {
        return res.status(400).json({ error: "quoteId is required" });
      }
      if (!shippingAddress) {
        return res.status(400).json({ error: "shippingAddress is required" });
      }
      const order = await orderService.acceptQuote(req.user.userId, {
        quoteId,
        shippingAddress,
      });
      res.status(201).json(order);
    } catch (error) {
      console.error(
        "Error accepting quote:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({ error: "Failed to accept quote" });
    }
  }

  async getUserOrders(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { orderId } = req.query;
      if (orderId) {
        const order = await orderService.getOrder(
          req.user.userId,
          orderId as string,
        );
        return res.json(order);
      }
      const orders = await orderService.getUserOrders(req.user.userId);
      res.json(orders);
    } catch (error) {
      console.error(
        "Error fetching user orders:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  }
}
