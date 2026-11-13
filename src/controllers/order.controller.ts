import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { stripe } from "../config/stripe";
import { HttpError } from "../utils/http-error";
import { ShippingAddress } from "../types/order.types";
import { isUuid } from "../utils/is-uuid";
import { hasAddressFields } from "../utils/address-fields";

const orderService = new OrderService();

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  // Stripe rejected the request (for example a payment that cannot be refunded)
  if (String((error as any)?.type ?? "").startsWith("Stripe")) {
    return res.status(400).json({ error: (error as Error).message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

export class OrderController {
  /**
   * Accept quote and create order (shipping optional, set later at checkout)
   */
  async acceptQuote(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { quoteId, shippingAddress } = req.body;
    if (!quoteId) {
      return res.status(400).json({ error: "quoteId is required" });
    }
    if (!isUuid(quoteId)) {
      return res.status(400).json({ error: "quoteId must be a UUID" });
    }
    if (shippingAddress && !hasAddressFields(shippingAddress)) {
      return res.status(400).json({
        error:
          "shippingAddress needs firstName, lastName, address, city, zip and country",
      });
    }
    try {
      const order = await orderService.acceptQuote(req.user.userId, {
        quoteId,
        shippingAddress: shippingAddress ?? null,
      });
      res.status(201).json(order);
    } catch (error) {
      sendError(res, error, "Failed to accept quote");
    }
  }

  async getUserOrders(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const { orderId } = req.query;
      if (orderId) {
        if (!isUuid(orderId)) {
          return res.status(404).json({ error: "Order not found" });
        }
        const order = await orderService.getOrder(
          req.user.userId,
          orderId as string,
        );
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }
        return res.json(order);
      }
      const orders = await orderService.getUserOrders(req.user.userId);
      res.json(orders);
    } catch (error) {
      sendError(res, error, "Failed to fetch orders");
    }
  }

  async payUserOrder(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { orderId } = req.params as { orderId: string };
    if (!isUuid(orderId)) {
      return res.status(404).json({ error: "Order not found" });
    }
    try {
      const clientSecret = await orderService.startPayment(req.user.userId, orderId);
      res.json({ clientSecret });
    } catch (error) {
      sendError(res, error, "Failed to create payment intent");
    }
  }

  async cancelUserOrder(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { orderId } = req.params as { orderId: string };
    if (!isUuid(orderId)) {
      return res.status(404).json({ error: "Order not found" });
    }
    try {
      await orderService.cancelOrder(req.user.userId, orderId);
      res.json({ message: "Order cancelled" });
    } catch (error) {
      sendError(res, error, "Failed to cancel order");
    }
  }

  async requestUserRefund(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { orderId } = req.params as { orderId: string };
    if (!isUuid(orderId)) {
      return res.status(404).json({ error: "Order not found" });
    }
    try {
      await orderService.requestRefund(req.user.userId, orderId);
      res.json({ paymentStatus: "refund_requested" });
    } catch (error) {
      sendError(res, error, "Failed to request refund");
    }
  }

  // Called by the checkout page after Stripe reports success
  async confirmUserPayment(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { orderId } = req.params as { orderId: string };
    if (!isUuid(orderId)) {
      return res.status(404).json({ error: "Order not found" });
    }
    try {
      await orderService.confirmPayment(req.user.userId, orderId);
      res.json({ paymentStatus: "paid" });
    } catch (error) {
      sendError(res, error, "Failed to confirm payment");
    }
  }

  async updateShippingAddress(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!hasAddressFields(req.body)) {
      return res.status(400).json({
        error:
          "shippingAddress needs firstName, lastName, address, city, zip and country",
      });
    }
    try {
      const { orderId } = req.params as { orderId: string };
      if (!isUuid(orderId)) {
        return res.status(404).json({ error: "Order not found" });
      }
      await orderService.updateShippingAddress(
        req.user.userId,
        orderId,
        req.body,
      );
      res.json({ message: "Shipping address updated" });
    } catch (error) {
      sendError(res, error, "Failed to update shipping address");
    }
  }
}
