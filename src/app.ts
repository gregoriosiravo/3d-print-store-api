import express, { Application } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { stripe } from "./config/stripe";
import quoteRoutes from "./routes/quote.route";
import authRoutes from "./routes/auth.route";
import ordersRoutes from "./routes/order.route";
import addressRouter from "./routes/address.route";
import webhookRouter from "./routes/webhook.route";

const app: Application = express();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  }),
);
app.use("/api/webhooks", webhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api", quoteRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", ordersRoutes);
app.use("/api", addressRouter);
// app.use('/api/products', productsRouter);

export default app;
