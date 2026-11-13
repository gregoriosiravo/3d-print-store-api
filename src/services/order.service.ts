import { pool } from "../config/database";
import {
  AcceptQuoteRequest,
  OrderResponse,
  ShippingAddress,
} from "../types/order.types";
import { Address } from "../types/address.types";
import { EmailService } from "./email.service";
import { AddressService } from "./address.service";
import { HttpError } from "../utils/http-error";
import { stripe } from "../config/stripe";

export class OrderService {
  private emailService: EmailService;
  private addressService: AddressService;

  constructor() {
    this.emailService = new EmailService();
    this.addressService = new AddressService();
  }

  /**
   * Turn a pending quote into an order. Shipping is optional here;
   * the checkout page sets it later with updateShippingAddress.
   */
  async acceptQuote(
    userId: string,
    data: AcceptQuoteRequest,
  ): Promise<OrderResponse> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Lock the quote row so two concurrent accepts cannot both pass the status check
      const quoteResult = await client.query(
        `SELECT * FROM quotes WHERE id = $1 FOR UPDATE`,
        [data.quoteId],
      );

      if (quoteResult.rows.length === 0) {
        throw new HttpError(404, "Quote not found");
      }

      const quote = quoteResult.rows[0];

      if (quote.user_id && quote.user_id !== userId) {
        throw new HttpError(403, "Unauthorized to accept this quote");
      }

      if (quote.status === "expired" || new Date() > new Date(quote.expires_at)) {
        throw new HttpError(410, "Quote has expired");
      }

      if (quote.status !== "pending") {
        throw new HttpError(409, "Quote has already been used for an order");
      }

      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomNum}`;

      const shipping = data.shippingAddress;
      const orderResult = await client.query(
        `INSERT INTO orders (
          user_id, quote_id, order_number, total_amount, status, payment_status,
          shipping_name, shipping_address, shipping_city, shipping_postal_code, shipping_country
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, order_number, total_amount, status, payment_status, created_at`,
        [
          userId,
          data.quoteId,
          orderNumber,
          quote.total_price,
          "pending",
          "pending",
          shipping ? `${shipping.firstName} ${shipping.lastName}` : null,
          shipping ? this.formatStreet(shipping) : null,
          shipping?.city ?? null,
          shipping?.zip ?? null,
          shipping?.country ?? null,
        ],
      );

      const order = orderResult.rows[0];

      await client.query(
        `UPDATE quotes
         SET status = $1, user_id = COALESCE(user_id, $2), updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        ["accepted", userId, data.quoteId],
      );

      await client.query("COMMIT");

      const userResult = await pool.query(
        "SELECT email, first_name FROM users WHERE id = $1",
        [userId],
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];

        try {
          await this.emailService.sendOrderConfirmation(
            user.email,
            order.order_number,
            order.total_amount,
          );
        } catch (error) {
          console.error("Failed to send order confirmation email:", error);
        }
      }

      console.log(`✅ Order created: ${order.order_number} for user ${userId}`);

      return {
        orderId: order.id,
        orderNumber: order.order_number,
        quoteId: data.quoteId,
        totalAmount: order.total_amount,
        status: order.status,
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get one order of a user, or null when it does not exist or belongs to someone else
   */
  async getOrder(userId: string, orderId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT
        o.*,
        q.stl_filename,
        q.volume_cm3,
        q.material_cost,
        q.machine_cost,
        q.labor_cost,
        q.estimated_print_time_minutes,
        m.name as material_name,
        m.type as material_type,
        pc.name as config_name,
        pc.layer_height,
        pc.infill_percentage
      FROM orders o
      LEFT JOIN quotes q ON o.quote_id = q.id
      LEFT JOIN materials m ON q.material_id = m.id
      LEFT JOIN print_configs pc ON q.print_config_id = pc.id
      WHERE o.id = $1 AND o.user_id = $2`,
      [orderId, userId],
    );

    return result.rows[0] ?? null;
  }

  /**
   * Get all orders for user
   */
  async getUserOrders(userId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT
        o.id,
        o.order_number,
        o.total_amount,
        o.status,
        o.payment_status,
        o.created_at,
        q.stl_filename,
        m.name as material_name
      FROM orders o
      LEFT JOIN quotes q ON o.quote_id = q.id
      LEFT JOIN materials m ON q.material_id = m.id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC`,
      [userId],
    );

    return result.rows;
  }

  /**
   * Cancel an order the user owns. A paid order is refunded through Stripe first.
   * The row is locked so a double click cannot refund twice.
   */
  async cancelOrder(userId: string, orderId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const found = await client.query(
        `SELECT status, payment_status, payment_id FROM orders
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [orderId, userId],
      );
      const order = found.rows[0];
      if (!order) {
        throw new HttpError(404, "Order not found");
      }
      if (["cancelled", "shipped", "completed"].includes(order.status)) {
        throw new HttpError(409, "Order can no longer be cancelled");
      }

      if (order.payment_status === "paid") {
        if (!order.payment_id) {
          throw new HttpError(409, "This paid order has no payment to refund");
        }
        // The key makes a retry after a failed COMMIT return the same refund instead of a second one
        await stripe.refunds.create(
          { payment_intent: order.payment_id, metadata: { orderId } },
          { idempotencyKey: `refund-${orderId}` },
        );
      }

      await client.query(
        `UPDATE orders
         SET status = 'cancelled',
             payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [orderId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    await pool.query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [status, orderId],
    );

    console.log(`✅ Order ${orderId} status updated to: ${status}`);
  }

  /**
   * Record the payment result. A paid order moves to "processing";
   * the order status is not touched otherwise.
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: string,
    paymentMethod: string,
    paymentId?: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE orders
       SET payment_status = $1,
           status = CASE WHEN $1 = 'paid' THEN 'processing' ELSE status END,
           payment_id = $2,
           payment_method = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [paymentStatus, paymentId, paymentMethod, orderId],
    );

    console.log(
      `✅ Order ${orderId} payment status updated to: ${paymentStatus}`,
    );
  }

  /**
   * Set the shipping address of an order the user owns.
   * The address is also saved to the address book when the user has none yet.
   */
  async updateShippingAddress(
    userId: string,
    orderId: string,
    address: ShippingAddress,
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE orders
       SET shipping_name = $1, shipping_address = $2, shipping_city = $3,
           shipping_postal_code = $4, shipping_country = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7`,
      [
        `${address.firstName} ${address.lastName}`,
        this.formatStreet(address),
        address.city,
        address.zip,
        address.country,
        orderId,
        userId,
      ],
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Order not found");
    }

    // Saving to the address book is a convenience; it must not fail the order update
    try {
      const existing = await this.addressService.checkAddressForUserOrder(userId);
      if (existing.length === 0) {
        await this.addressService.addAddress(userId, {
          firstName: address.firstName,
          lastName: address.lastName,
          address: address.address,
          addressInfo: address.addressInfo ?? "",
          city: address.city,
          zip: address.zip,
          country: address.country,
          isPrimary: address.isPrimary ?? false,
        });
      }
    } catch (error) {
      console.error(`Could not save address book entry for user ${userId}:`, error);
    }
  }

  private formatStreet(address: ShippingAddress): string {
    return address.addressInfo
      ? `${address.address}, ${address.addressInfo}`
      : address.address;
  }
}
