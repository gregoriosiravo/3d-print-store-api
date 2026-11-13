import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
dotenv.config();

import quoteRoutes from "./routes/quote.route";
import authRoutes from "./routes/auth.route";
import ordersRoutes from "./routes/order.route";
import addressRouter from "./routes/address.route";
import paymentMethodRouter from "./routes/payment-method.route";
import webhookRouter from "./routes/webhook.route";

const app: Application = express();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true, // the browser sends the session cookie
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
app.use("/api", paymentMethodRouter);

// Errors from middleware (upload, JSON body): JSON, never the default HTML page
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large (maximum 50 MB)"
        : err.message;
    return res.status(400).json({ error: message });
  }
  if (err.message === "Only STL files are allowed") {
    return res.status(400).json({ error: err.message });
  }
  if (typeof err.status === "number" && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
