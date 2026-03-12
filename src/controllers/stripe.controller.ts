import { Request, Response } from "express";
import { stripe } from "../config/stripe"; // your stripe instance
import { OrderService } from "../services/order.service";

const orderService = new OrderService();

export const webhookController = {
  async handleStripeWebhook(req: Request, res: Response) {
    const sig = req.headers["stripe-signature"]!;

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return res.status(400).json({ error: "Invalid signature" });
    }
    console.log("📦 Webhook event type:", event.type); // ✅ add this
    console.log(
      "📦 Webhook event data:",
      JSON.stringify(event.data.object, null, 2),
    ); // ✅ and this

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;
      console.log("💳 Processing payment for orderId:", orderId);
      await orderService.updatePaymentStatus(
        orderId,
        "paid",
        "stripe",
        paymentIntent.id,
      );
    }
    res.json({ received: true });
  },
};
