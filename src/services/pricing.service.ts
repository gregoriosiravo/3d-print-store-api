import { pool } from "../config/database";
import { PricingRequest, PricingBreakdown } from "../types/quote.types";

export class PricingService {
  /**
   * Calculate price based on STL analysis and selected options
   */
  async calculatePrice(request: PricingRequest): Promise<PricingBreakdown> {
    const materialResult = await pool.query(
      "SELECT * FROM materials WHERE id = $1",
      [request.materialId],
    );

    if (materialResult.rows.length === 0) {
      throw new Error("Material not found");
    }

    const configResult = await pool.query(
      "SELECT * FROM print_configs WHERE id = $1",
      [request.printConfigId],
    );

    if (configResult.rows.length === 0) {
      throw new Error("Print configuration not found");
    }

    const material = materialResult.rows[0];
    const config = configResult.rows[0];

    const volumeCm3 = request.stlAnalysis.volumeCm3;
    const surfaceAreaCm2 = request.stlAnalysis.surfaceAreaCm2;
    const density = parseFloat(material.density); // g/cm³
    const infillPercentage = config.infill_percentage / 100;
    const costPerGram = parseFloat(material.cost_per_gram);
    const wallThicknessCm = 0.12;

    const shellVolumeCm3 = surfaceAreaCm2 * wallThicknessCm;
    const interiorVolumeCm3 = Math.max(0, volumeCm3 - shellVolumeCm3);
    const materialVolumeCm3 =
      shellVolumeCm3 + interiorVolumeCm3 * infillPercentage;

    const materialWeightGrams = materialVolumeCm3 * density;
    const materialCost = materialWeightGrams * costPerGram;

    const layerHeight = parseFloat(config.layer_height); // mm
    const timeMultiplier = parseFloat(config.time_multiplier);
    const boundingBoxZ = request.stlAnalysis.boundingBox.z * 10; // Convert cm to mm

    const numberOfLayers = boundingBoxZ / layerHeight;
    const baseTimeMinutes = numberOfLayers * 0.5 * timeMultiplier;
    const estimatedPrintTimeMinutes = Math.round(baseTimeMinutes);

    // Machine cost
    const machineHourlyRate = parseFloat(
      process.env.BASE_MACHINE_COST_PER_HOUR || "5.00",
    );
    const machineCost = (estimatedPrintTimeMinutes / 60) * machineHourlyRate;

    const laborPercentage = 0.15; // 15%
    const laborCost = (materialCost + machineCost) * laborPercentage;

    const subtotal = materialCost + machineCost + laborCost;

    // Apply markup
    const markupPercentage =
      parseFloat(process.env.MARKUP_PERCENTAGE || "30") / 100;
    const totalPrice = subtotal * (1 + markupPercentage);

    return {
      materialCost: parseFloat(materialCost.toFixed(2)),
      machineCost: parseFloat(machineCost.toFixed(2)),
      laborCost: parseFloat(laborCost.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      estimatedPrintTimeMinutes,
      materialWeightGrams: parseFloat(materialWeightGrams.toFixed(2)),
    };
  }
}
