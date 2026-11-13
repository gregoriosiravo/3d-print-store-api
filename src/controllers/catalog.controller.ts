import { Request, Response } from "express";
import { CatalogService } from "../services/catalog.service";

const catalogService = new CatalogService();

// Public reference data for the Materials and Services pages
export class CatalogController {
  async materials(req: Request, res: Response) {
    try {
      res.json(await catalogService.listMaterials());
    } catch (error) {
      console.error("Failed to list materials:", error);
      res.status(500).json({ error: "Failed to load materials" });
    }
  }

  async printPresets(req: Request, res: Response) {
    try {
      res.json(await catalogService.listPrintPresets());
    } catch (error) {
      console.error("Failed to list print presets:", error);
      res.status(500).json({ error: "Failed to load print presets" });
    }
  }
}
