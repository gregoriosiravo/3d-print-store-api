import { Request, Response } from "express";
import { StlParserService } from "../services/stl-parser.service";
import {
  PricingService,
  TIME_MULTIPLIER_BY_LAYER_HEIGHT,
} from "../services/pricing.service";
import { pool } from "../config/database";
import { v4 as uuidv4 } from "uuid";
import { OrderService } from "../services/order.service";
import { HttpError } from "../utils/http-error";
import { isUuid } from "../utils/is-uuid";

const stlParser = new StlParserService();
const pricingService = new PricingService();
const orderService = new OrderService();

export class QuoteController {
  /**
   * Upload STL and generate quote
   */
  async createQuote(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No STL file uploaded" });
      }

      const { materialId, layerHeight, infillDensity } = req.body;

      if (!materialId || !layerHeight || !infillDensity) {
        return res.status(400).json({
          error: "materialId, layerHeight and infillDensity are required",
        });
      }

      const layerHeightMm = parseFloat(layerHeight);
      const infillPercentage = parseInt(infillDensity);
      if (
        !(layerHeightMm in TIME_MULTIPLIER_BY_LAYER_HEIGHT) ||
        !(infillPercentage >= 1 && infillPercentage <= 100)
      ) {
        return res.status(400).json({
          error: "Unsupported layerHeight or infillDensity",
        });
      }

      // Parse STL file
      const stlAnalysis = await stlParser.analyzeStlFile(
        req.file.path,
        req.file.filename,
      );

      const config = await pricingService.getOrCreateConfig(
        layerHeightMm,
        infillPercentage,
      );
      const pricing = await pricingService.calculatePrice({
        materialId: parseInt(materialId),
        config,
        stlAnalysis,
      });

      // Store quote in database
      const quoteId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire in 7 days

      const sessionId = req.headers["x-session-id"] || uuidv4();

      await pool.query(
        `INSERT INTO quotes (
          id, session_id, stl_filename, s3_key,
          volume_cm3, surface_area_cm2,
          bounding_box_x, bounding_box_y, bounding_box_z,
          material_id, print_config_id,
          material_cost, machine_cost, labor_cost, total_price,
          estimated_print_time_minutes, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          quoteId,
          sessionId,
          stlAnalysis.filename,
          req.file.path,
          stlAnalysis.volumeCm3,
          stlAnalysis.surfaceAreaCm2,
          stlAnalysis.boundingBox.x,
          stlAnalysis.boundingBox.y,
          stlAnalysis.boundingBox.z,
          materialId,
          config.id,
          pricing.materialCost,
          pricing.machineCost,
          pricing.laborCost,
          pricing.totalPrice,
          pricing.estimatedPrintTimeMinutes,
          "pending",
          expiresAt,
        ],
      );

      // Return quote response
      res.json({
        quoteId,
        ...stlAnalysis,
        pricing: {
          materialCost: pricing.materialCost,
          machineCost: pricing.machineCost,
          laborCost: pricing.laborCost,
          totalPrice: pricing.totalPrice,
        },
        materialWeightGrams: pricing.materialWeightGrams,
        estimatedPrintTimeMinutes: pricing.estimatedPrintTimeMinutes,
        expiresAt,
      });
    } catch (error) {
      console.error("Error creating quote:", error);
      res.status(500).json({
        error: "Failed to process STL file",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get quote by ID. Quotes owned by a user are only visible to that user;
   * guest quotes (no owner) are reachable by their UUID, which is the link the guest got.
   */
  async getQuote(req: Request, res: Response) {
    try {
      const { quoteId } = req.params;
      if (!isUuid(quoteId)) {
        return res.status(404).json({ error: "Quote not found" });
      }

      const result = await pool.query("SELECT * FROM quotes WHERE id = $1", [
        quoteId,
      ]);

      const quote = result.rows[0];
      if (!quote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      if (quote.user_id && quote.user_id !== req.user?.userId) {
        return res.status(404).json({ error: "Quote not found" });
      }

      res.json(quote);
    } catch (error) {
      console.error("Error fetching quote:", error);
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  }

  /**
   * Get all quotes for authenticated user
   */
  async getUserQuotes(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const result = await pool.query(
        `SELECT q.*, m.name as material_name, pc.name as config_name
         FROM quotes q
         LEFT JOIN materials m ON q.material_id = m.id
         LEFT JOIN print_configs pc ON q.print_config_id = pc.id
         WHERE q.user_id = $1
         ORDER BY q.created_at DESC`,
        [req.user.userId],
      );

      res.json({ quotes: result.rows });
    } catch (error) {
      console.error("Error fetching user quotes:", error);
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  }

  /**
   * Associate a guest quote with the authenticated user (after login).
   * The owner comes from the token, not from the request body.
   */
  async associateQuoteWithUser(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { quoteId } = req.body;
      if (!isUuid(quoteId)) {
        return res.status(400).json({ error: "quoteId must be a UUID" });
      }

      const result = await pool.query(
        `UPDATE quotes SET user_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id IS NULL`,
        [req.user.userId, quoteId],
      );
      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ error: "Quote not found or already associated" });
      }

      return res.status(200).json({ message: "Quote associated successfully" });
    } catch (error) {
      console.error("Error associating quote with user:", error);
      res.status(500).json({ error: "Failed to associate quote with user" });
    }
  }

  /**
   * Reject (delete) a quote the user owns. Only pending quotes can be rejected;
   * accepted quotes are referenced by orders.
   */
  async rejectQuote(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { quoteId } = req.params;
      if (!isUuid(quoteId)) {
        return res.status(404).json({ error: "Quote not found" });
      }
      const result = await pool.query(
        `DELETE FROM quotes WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
        [quoteId, req.user.userId],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Quote not found, not owned by user, or already ordered",
        });
      }
      res.json({ message: "Quote declined successfully" });
    } catch (error) {
      console.error("Error declining quote:", error);
      res.status(500).json({ error: "Failed to decline quote" });
    }
  }

  /**
   * Approve a quote: creates a pending order at the quote's price.
   * The price comes from the stored quote, never from the request.
   */
  async approveQuote(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const quoteId = req.params.quoteId as string;
      if (!isUuid(quoteId)) {
        return res.status(404).json({ error: "Quote not found" });
      }
      const order = await orderService.acceptQuote(req.user.userId, {
        quoteId,
      });
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Error approving quote:", error);
      res.status(500).json({ error: "Failed to approve quote" });
    }
  }
}
