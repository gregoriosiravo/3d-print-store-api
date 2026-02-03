import express, { Application } from "express";
import cors from "cors";
import dotenv from "dotenv";
import quoteRoutes from "./routes/quote.route";
import authRoutes from "./routes/auth.route";
import ordersRoutes from "./routes/order.route";

dotenv.config();

const app: Application = express();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  }),
);
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
// app.use('/api/products', productsRouter);

export default app;
