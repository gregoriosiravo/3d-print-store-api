import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import quoteRoutes from './routes/quote.route';
import authRoutes from './routes/auth.route';

dotenv.config();

const app: Application = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes will be added here
app.use('/api', quoteRoutes);
app.use('/api/auth', authRoutes);
// app.use('/api/products', productsRouter);

export default app;
