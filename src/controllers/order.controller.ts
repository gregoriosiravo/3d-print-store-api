import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { stripe } from "../config/stripe";
import { HttpError } from "../utils/http-error";
import { ShippingAddress } from "../types/order.types";
import { isUuid } from "../utils/is-uuid";

const orderService = new OrderService();

const REQUIRED_SHIPPING_FIELDS: (keyof ShippingAddress)[] = [
  "firstName",
  "lastName",
  "address",
  "city",
  "zip",
  "country",
];

function hasShippingFields(body: unknown): body is ShippingAddress {
  if (!body || typeof body !== "object") return false;
  return REQUIRED_SHIPPING_FIELDS.every(
    (field) =>
      typeof (body as Record<string, unknown>)[field] === "string" &&
      ((body as Record<string, unknown>)[field] as string).trim() !== "",
  );
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
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
    if (shippingAddress && !hasShippingFields(shippingAddress)) {
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
    try {
      const { orderId } = req.params as { orderId: string };
      const order = isUuid(orderId)
        ? await orderService.getOrder(req.user.userId, orderId)
        : null;

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.payment_status === "paid") {
        return res.status(400).json({ error: "Order is already paid" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(order.total_amount) * 100),
        currency: "eur",
        metadata: { orderId },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      sendError(res, error, "Failed to create payment intent");
    }
  }

  async updateShippingAddress(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!hasShippingFields(req.body)) {
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
