import { pool } from "../config/database";
import { Address } from "../types/address.types";
import { HttpError } from "../utils/http-error";

export class AddressService {
  async getUserAddresses(userId: string): Promise<Address[]> {
    const result = await pool.query(
      "SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_primary DESC, created_at",
      [userId],
    );
    return result.rows as Address[];
  }

  async addAddress(userId: string, addressData: Address): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (addressData.isPrimary) {
        await this.clearPrimary(client, userId);
      }
      await client.query(
        `INSERT INTO addresses
          (user_id, is_primary, first_name, last_name, address, address_info, city, zip, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          addressData.isPrimary ?? false,
          addressData.firstName,
          addressData.lastName,
          addressData.address,
          addressData.addressInfo ?? null,
          addressData.city,
          addressData.zip,
          addressData.country,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async editAddress(
    userId: string,
    addressId: string,
    addressData: Address,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (addressData.isPrimary) {
        await this.clearPrimary(client, userId);
      }
      const result = await client.query(
        `UPDATE addresses SET
           first_name = $1, last_name = $2, address = $3, address_info = $4,
           city = $5, zip = $6, country = $7, is_primary = $8,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $9 AND user_id = $10`,
        [
          addressData.firstName,
          addressData.lastName,
          addressData.address,
          addressData.addressInfo ?? null,
          addressData.city,
          addressData.zip,
          addressData.country,
          addressData.isPrimary ?? false,
          addressId,
          userId,
        ],
      );
      if (result.rowCount === 0) {
        throw new HttpError(404, "Address not found");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async setPrimaryAddress(userId: string, addressId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await this.clearPrimary(client, userId);
      const result = await client.query(
        "UPDATE addresses SET is_primary = true WHERE id = $1 AND user_id = $2",
        [addressId, userId],
      );
      if (result.rowCount === 0) {
        throw new HttpError(404, "Address not found");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const result = await pool.query(
      "DELETE FROM addresses WHERE id = $1 AND user_id = $2",
      [addressId, userId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, "Address not found");
    }
  }

  // Used when an order needs a shipping address: the user's saved addresses
  async checkAddressForUserOrder(userId: string): Promise<Address[]> {
    const result = await pool.query(
      "SELECT address, city, zip, address_info, country FROM addresses WHERE user_id = $1",
      [userId],
    );
    return result.rows as Address[];
  }

  private async clearPrimary(
    client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    userId: string,
  ) {
    await client.query(
      "UPDATE addresses SET is_primary = false WHERE user_id = $1 AND is_primary",
      [userId],
    );
  }
}
