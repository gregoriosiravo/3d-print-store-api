import { pool } from "../config/database";

export class CatalogService {
  async listMaterials() {
    const result = await pool.query(
      `SELECT id, name, type, color FROM materials
       WHERE is_available ORDER BY id`,
    );
    return result.rows;
  }

  // Combinations created for quotes are named like "0.1mm / 15%"; only the named presets are listed
  async listPrintPresets() {
    const result = await pool.query(
      `SELECT id, name, layer_height, infill_percentage, support_enabled, print_speed
       FROM print_configs
       WHERE name NOT LIKE '%mm / %%'
       ORDER BY id`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      layerHeight: Number(row.layer_height),
      infillPercentage: row.infill_percentage,
      supportEnabled: row.support_enabled,
      printSpeed: row.print_speed,
    }));
  }
}
