import { pool } from "../config/database";
import { Address } from "../types/address.types";

export class AddressService {
  /**
   * Get user addresses
   */
  async getUserAdresses(userId: string): Promise<Address[]> {
    console.log(`Getting addresses for user ${userId}`);
    const result = await pool.query(
      "SELECT * FROM addresses WHERE user_id = $1",
      [userId],
    );
    return result.rows as Address[];
  }

  /**
   * Add a new address for a user
   */
  async addAddress(userId: string, addressData: Address): Promise<void> {
    const {
      firstName,
      lastName,
      address,
      addressInfo,
      city,
      zip,
      country,
      isPrimary,
    } = addressData;

    try {
      await pool.query(
        `INSERT INTO addresses 
       (user_id, is_primary, first_name, last_name, address, city, zip, address_info, country, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId,
          isPrimary,
          firstName,
          lastName,
          address,
          city,
          zip,
          addressInfo,
          country,
        ],
      );
      console.log(`Address added for user ${userId}`);
    } catch (error) {
      console.error(`Error adding address for user ${userId}:`, error);
    }
  }

  /**
   * Delete an address for a user
   */
  async deleteAddress(userId: string, addressId: string): Promise<void> {
    try {
      await pool.query(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [
        addressId,
        userId,
      ]);
      console.log(`Address ${addressId} deleted for user ${userId}`);
    } catch (error) {
      console.error(
        `Error deleting address ${addressId} for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Check if the user has an address for the order
   */
  async checkAddressForUserOrder(userId: string): Promise<any> {
    try {
      const { rows } = await pool.query(
        `SELECT address, city, zip, address_info, country FROM addresses where user_id = $1`,
        [userId],
      );
      return rows as Address[];
    } catch (error) {
      console.error(`Error selecting address  for user ${userId}:`, error);
    }
  }
  /**
   * Set the primary address for a user
   */
  async setPrimaryAddress(userId: string, addressId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE addresses SET is_primary = (id = $1) WHERE user_id = $2`,
        [addressId, userId],
      );
      console.log(`Primary address set to ${addressId} for user ${userId}`);
    } catch (error) {
      console.error(
        `Error setting primary address ${addressId} for user ${userId}:`,
        error,
      );
    }
  }
}
