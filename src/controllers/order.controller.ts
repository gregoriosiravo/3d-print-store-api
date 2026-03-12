import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { stripe } from "../config/stripe";

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

  async payUserOrder(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { orderId } = req.params as { orderId: string };
      const order = await orderService.getOrder(req.user.userId, orderId);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.payment_status === "paid") {
        return res.status(400).json({ error: "Order is already paid" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(order.total_amount * 100),
        currency: "eur",
        metadata: { orderId },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  }
  async updateShippingAddress(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { orderId } = req.params as { orderId: string };
      console.log("rhis is shipping address", req.body);
      const shippingAddress = req.body;

      if (!shippingAddress) {
        return res.status(400).json({ error: "shippingAddress is required" });
      }

      const updatedOrder = await orderService.updateShippingAddress(
        orderId,
        shippingAddress,
      );

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating shipping address:", error);
      res.status(500).json({ error: "Failed to update shipping address" });
    }
  }
}
