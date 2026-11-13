import { pool } from "../config/database";
import { stripe } from "../config/stripe";
import { HttpError } from "../utils/http-error";
import {
  CreateSetupIntentResponse,
  PaymentMethodDto,
} from "../types/payment-method.types";

export class PaymentMethodsService {
  /**
   * One Stripe customer per user, stored on users.stripe_customer_id.
   * The conditional UPDATE keeps two concurrent first calls from storing two customers.
   */
  async getOrCreateCustomerId(userId: string): Promise<string> {
    const userResult = await pool.query(
      "SELECT email, stripe_customer_id FROM users WHERE id = $1",
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    if (user.stripe_customer_id) {
      return user.stripe_customer_id;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });

    const updated = await pool.query(
      `UPDATE users SET stripe_customer_id = $1
       WHERE id = $2 AND stripe_customer_id IS NULL
       RETURNING stripe_customer_id`,
      [customer.id, userId],
    );
    if (updated.rowCount) {
      return customer.id;
    }

    const stored = await pool.query(
      "SELECT stripe_customer_id FROM users WHERE id = $1",
      [userId],
    );
    return stored.rows[0].stripe_customer_id;
  }

  async createSetupIntent(userId: string): Promise<CreateSetupIntentResponse> {
    const customerId = await this.getOrCreateCustomerId(userId);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    return { clientSecret: setupIntent.client_secret as string };
  }

  /**
   * Store a card that the client collected with a SetupIntent
   */
  async savePaymentMethod(
    userId: string,
    paymentMethodId: string,
    makeDefault = false,
  ): Promise<void> {
    const customerId = await this.getOrCreateCustomerId(userId);

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== customerId) {
      throw new HttpError(403, "Payment method does not belong to this user");
    }
    if (paymentMethod.type !== "card" || !paymentMethod.card) {
      throw new HttpError(400, "Only card payment methods are supported");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (makeDefault) {
        await client.query(
          "UPDATE payment_methods SET is_default = false WHERE user_id = $1 AND is_default",
          [userId],
        );
      }

      // The WHERE on the conflict branch refuses to move a card that belongs to another user
      const saved = await client.query(
        `INSERT INTO payment_methods
          (user_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (stripe_payment_method_id) DO UPDATE SET
           brand = EXCLUDED.brand,
           last4 = EXCLUDED.last4,
           exp_month = EXCLUDED.exp_month,
           exp_year = EXCLUDED.exp_year,
           is_default = payment_methods.is_default OR EXCLUDED.is_default
         WHERE payment_methods.user_id = EXCLUDED.user_id
         RETURNING id`,
        [
          userId,
          customerId,
          paymentMethod.id,
          paymentMethod.card.brand,
          paymentMethod.card.last4,
          paymentMethod.card.exp_month,
          paymentMethod.card.exp_year,
          makeDefault,
        ],
      );
      if (saved.rowCount === 0) {
        throw new HttpError(403, "Payment method belongs to another user");
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (makeDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod.id },
      });
    }
  }

  async listPaymentMethods(userId: string): Promise<PaymentMethodDto[]> {
    const result = await pool.query(
      `SELECT id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, created_at
       FROM payment_methods
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      // Stripe's reference, needed to pay with this card; not a secret
      stripePaymentMethodId: row.stripe_payment_method_id,
      brand: row.brand,
      last4: row.last4,
      expMonth: row.exp_month,
      expYear: row.exp_year,
      isDefault: row.is_default,
      createdAt: row.created_at,
    }));
  }

  async setDefaultPaymentMethod(userId: string, id: string): Promise<void> {
    const client = await pool.connect();
    let card: { stripe_payment_method_id: string; stripe_customer_id: string };
    try {
      await client.query("BEGIN");

      const owned = await client.query(
        `SELECT stripe_payment_method_id, stripe_customer_id
         FROM payment_methods WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [id, userId],
      );
      if (owned.rowCount === 0) {
        throw new HttpError(404, "Payment method not found");
      }
      card = owned.rows[0];

      await client.query(
        "UPDATE payment_methods SET is_default = false WHERE user_id = $1 AND is_default",
        [userId],
      );
      await client.query(
        "UPDATE payment_methods SET is_default = true WHERE id = $1",
        [id],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await stripe.customers.update(card.stripe_customer_id, {
      invoice_settings: { default_payment_method: card.stripe_payment_method_id },
    });
  }

  async deletePaymentMethod(userId: string, id: string): Promise<void> {
    const owned = await pool.query(
      "SELECT stripe_payment_method_id FROM payment_methods WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    if (owned.rowCount === 0) {
      throw new HttpError(404, "Payment method not found");
    }

    try {
      await stripe.paymentMethods.detach(owned.rows[0].stripe_payment_method_id);
    } catch (error: any) {
      // Already detached on Stripe's side: the local row can still be removed
      if (error?.code !== "resource_missing") throw error;
    }

    await pool.query("DELETE FROM payment_methods WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);
  }
}

export const paymentMethodsService = new PaymentMethodsService();
