import { Router } from "express";
import { CatalogController } from "../controllers/catalog.controller";

const router = Router();
const catalogController = new CatalogController();

router.get("/materials", catalogController.materials.bind(catalogController));
router.get("/print-presets", catalogController.printPresets.bind(catalogController));

export default router;
