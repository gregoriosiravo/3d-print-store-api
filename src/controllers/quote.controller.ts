import { Request, Response } from 'express';
import { StlParserService } from '../services/stl-parser.service';
import { PricingService } from '../services/pricing.service';
import { pool } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

const stlParser = new StlParserService();
const pricingService = new PricingService();

export class QuoteController {
  /**
   * Upload STL and generate quote
   */
  async createQuote(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No STL file uploaded' });
      }

      const { materialId, printConfigId } = req.body;

      if (!materialId || !printConfigId) {
        return res.status(400).json({ 
          error: 'materialId and printConfigId are required' 
        });
      }

      // Parse STL file
      const stlAnalysis = await stlParser.analyzeStlFile(
        req.file.path,
        req.file.filename
      );

      // Calculate pricing
      const pricing = await pricingService.calculatePrice({
        materialId: parseInt(materialId),
        printConfigId: parseInt(printConfigId),
        stlAnalysis,
      });

      // Store quote in database
      const quoteId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire in 7 days

      const sessionId = req.headers['x-session-id'] || uuidv4();

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
          quoteId, sessionId, stlAnalysis.filename, req.file.path,
          stlAnalysis.volumeCm3, stlAnalysis.surfaceAreaCm2,
          stlAnalysis.boundingBox.x, stlAnalysis.boundingBox.y, stlAnalysis.boundingBox.z,
          materialId, printConfigId,
          pricing.materialCost, pricing.machineCost, pricing.laborCost, pricing.totalPrice,
          pricing.estimatedPrintTimeMinutes, 'pending', expiresAt
        ]
      );

      // Return quote response
      res.json({
        quoteId,
        ...stlAnalysis,
        ...pricing,
        expiresAt,
      });

    } catch (error) {
      console.error('Error creating quote:', error);
      res.status(500).json({ 
        error: 'Failed to process STL file',
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get quote by ID
   */
  async getQuote(req: Request, res: Response) {
    try {
      const { quoteId } = req.params;

      const result = await pool.query(
        'SELECT * FROM quotes WHERE id = $1',
        [quoteId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching quote:', error);
      res.status(500).json({ error: 'Failed to fetch quote' });
    }
  }
}
