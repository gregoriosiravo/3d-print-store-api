import fs from "fs/promises";
import { STLAnalysis } from "../types/quote.types";
const NodeStl = require("node-stl");

export class StlParserService {
  /**
   * Parse STL file and extract geometric data
   */
  async analyzeStlFile(
    filepath: string,
    filename: string,
  ): Promise<STLAnalysis> {
    try {
      //const fileBuffer = await fs.readFile(filepath);
      const stl = new NodeStl(filepath);
      const volumeCm3 = parseFloat((stl.volume).toFixed(4)); // in cm³
      const surfaceAreaCm2 = parseFloat((stl.area / 100).toFixed(4));
      const boundingBox = {
        x: parseFloat((stl.boundingBox[0] / 10).toFixed(2)), // Width in cm
        y: parseFloat((stl.boundingBox[1] / 10).toFixed(2)), // Depth in cm
        z: parseFloat((stl.boundingBox[2] / 10).toFixed(2)), // Height in cm
      };
      console.log("📊 STL Analysis:");
      console.log("  Volume:", volumeCm3, "cm³");
      console.log("  Weight:", stl.weight, "g (at default density)");
      console.log("  Surface Area:", surfaceAreaCm2, "cm²");
      console.log("  Bounding Box:", boundingBox);
      console.log("  Watertight:", stl.isWatertight);
      return {  
        filename,
        filepath,
        volumeCm3,
        surfaceAreaCm2,
        boundingBox,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse STL file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
