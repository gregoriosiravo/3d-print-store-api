import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { QuoteController } from '../controllers/quote.controller';

const router = Router();
const quoteController = new QuoteController();

// Configure multer for STL file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/stl-files');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.stl') {
      return cb(new Error('Only STL files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Routes
router.post('/quote', upload.single('stl'), quoteController.createQuote.bind(quoteController));
router.get('/quote/:quoteId', quoteController.getQuote.bind(quoteController));

export default router;
