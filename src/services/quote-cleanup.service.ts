import { promises as fs } from "fs";
import { pool } from "../config/database";

// Removes an uploaded STL; a file that is already gone is not an error
export async function removeUpload(filepath: string | null | undefined) {
  if (!filepath) return;
  await fs.unlink(filepath).catch((error) => {
    if (error.code !== "ENOENT") console.error("Could not remove upload:", error);
  });
}

/**
 * Marks pending quotes past their expiry as expired and removes their files.
 * Returns how many quotes expired.
 */
export async function expirePendingQuotes(): Promise<number> {
  const result = await pool.query(
    `UPDATE quotes SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP
     RETURNING s3_key`,
  );
  for (const row of result.rows) {
    await removeUpload(row.s3_key);
  }
  return result.rowCount ?? 0;
}
