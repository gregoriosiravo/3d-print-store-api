export interface STLAnalysis {
  filename: string;
  filepath: string;
  volumeCm3: number;
  surfaceAreaCm2: number;
  boundingBox: {
    x: number;
    y: number;
    z: number;
  };
}

export interface PrintConfigRow {
  id: number;
  name: string;
  layer_height: string;
  infill_percentage: number;
  time_multiplier: string;
}

export interface PricingRequest {
  materialId: number;
  config: PrintConfigRow;
  stlAnalysis: STLAnalysis;
}

export interface PricingBreakdown {
  materialCost: number;
  machineCost: number;
  laborCost: number;
  totalPrice: number;
  materialWeightGrams: number;
  estimatedPrintTimeMinutes: number;
}

export interface QuoteResponse extends STLAnalysis, PricingBreakdown {
  quoteId: string;
  expiresAt: Date;
}
