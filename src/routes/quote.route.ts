import { Router } from "express";
import multer from "multer";
import path from "path";
import { QuoteController } from "../controllers/quote.controller";
import { authenticate, optionalAuth } from "../middleware/auth.middleware";
import { rateLimit } from "express-rate-limit";

const router = Router();

// Uploads write files to disk, so cap how often one client can send them
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.QUOTE_RATE_LIMIT ?? 60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many uploads, try again later" },
});

const quoteController = new QuoteController();

// Configure multer for STL file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/stl-files");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".stl") {
      return cb(new Error("Only STL files are allowed"));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Routes
router.post(
  "/quote",
  uploadLimiter,
  optionalAuth,
  upload.single("stl"),
  quoteController.createQuote.bind(quoteController),
);
router.get(
  "/quote/:quoteId",
  optionalAuth,
  quoteController.getQuote.bind(quoteController),
);

// Protected routes - require authentication
router.get(
  "/quotes",
  authenticate,
  quoteController.getUserQuotes.bind(quoteController),
);

router.post(
  "/quote/associate",
  authenticate,
  quoteController.associateQuoteWithUser.bind(quoteController),
);

router.post(
  "/quote/:quoteId/approve",
  authenticate,
  quoteController.approveQuote.bind(quoteController),
);

router.post(
  "/quote/:quoteId/reject",
  authenticate,
  quoteController.rejectQuote.bind(quoteController),
);

export default router;
