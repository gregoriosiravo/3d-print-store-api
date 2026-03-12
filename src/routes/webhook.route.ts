import express from "express";
import { webhookController } from "../controllers/stripe.controller";

const router = express.Router();

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  webhookController.handleStripeWebhook,
);

export default router;
