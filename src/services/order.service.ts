import { pool } from "../config/database";
import { AcceptQuoteRequest, OrderResponse } from "../types/order.types";
import { EmailService } from "./email.service";

export class OrderService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Accept quote and create order
   */
  async acceptQuote(
    userId: string,
    data: AcceptQuoteRequest,
  ): Promise<OrderResponse> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const quoteResult = await client.query(
        `SELECT * FROM quotes WHERE id = $1`,
        [data.quoteId],
      );

      if (quoteResult.rows.length === 0) {
        throw new Error("Quote not found");
      }

      const quote = quoteResult.rows[0];

      if (new Date() > new Date(quote.expires_at)) {
        throw new Error("Quote has expired");
      }

      if (quote.status === "ordered") {
        throw new Error("Quote has already been used for an order");
      }

      if (quote.user_id && quote.user_id !== userId) {
        throw new Error("Unauthorized to accept this quote");
      }

      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${dateStr}-${randomNum}`;

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
          data.shippingAddress.name,
          data.shippingAddress.address,
          data.shippingAddress.city,
          data.shippingAddress.postalCode,
          data.shippingAddress.country,
        ],
      );

      const order = orderResult.rows[0];

      await client.query(
        `UPDATE quotes 
         SET status = $1, user_id = COALESCE(user_id, $2)
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
   * Get order by ID
   */
  async getOrder(userId: string, orderId: string): Promise<any> {
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

    if (result.rows.length === 0) {
      throw new Error("Order not found");
    }

    return result.rows[0];
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
   * Update payment status
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: string,
    paymentId?: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE orders 
       SET payment_status = $1, payment_id = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [paymentStatus, paymentId, orderId],
    );

    console.log(
      `✅ Order ${orderId} payment status updated to: ${paymentStatus}`,
    );
  }
}
