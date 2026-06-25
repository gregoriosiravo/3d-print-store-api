import { pool } from "../config/database";
import { prisma } from "../config/prisma";
import {
  CreateSetupIntentResponse,
  PaymentMethodDto,
} from "../types/payment-method.types";
import { stripe } from "../config/stripe";
import { QueryResult } from "pg";

export class PaymentMethodsService {
  async getOrSetStripeCustomer(user: {
    userId: string;
    email?: string;
    stripeCustomerId?: string | null;
  }) {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.userId },
    });
    let isUserStripePresent: QueryResult<{ id: string }> = await pool.query(
      "SELECT id FROM payment_methods WHERE stripe_customer_id = $1",
      [customer.id],
    );
    if (isUserStripePresent.rows.length > 0) {
      await pool.query(
        "INSERT INTO payment_methods (stripe_customer_id, user_id) VALUES ($1, $2)",
        [customer.id, user.userId],
      );
    } else {
      await pool.query(
        "UPDATE payment_methods SET stripe_customer_id = $1 WHERE id = $2",
        [customer.id, user.userId],
      );
    }
    return customer.id;
  }

  async createSetupIntent(user: {
    userId: string;
    email?: string;
    stripeCustomerId?: string | null;
  }): Promise<CreateSetupIntentResponse> {
    const stripeCustomerId = await this.getOrSetStripeCustomer(user);

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });

    return {
      clientSecret: setupIntent.client_secret as string,
    };
  }

  async savePaymentMethod(
    user: { userId: string; email?: string; stripeCustomerId?: string | null },
    paymentMethodId: string,
    makeDefault = false,
  ): Promise<void> {
    const stripeCustomerId = await this.getOrSetStripeCustomer(user);

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== stripeCustomerId) {
      throw new Error("Payment method does not belong to this user");
    }

    if (paymentMethod.type !== "card" || !paymentMethod.card) {
      throw new Error("Only card payment methods are supported");
    }

    await prisma.$transaction(async (tx: typeof prisma) => {
      if (makeDefault) {
        await tx.payment_methods.updateMany({
          where: { user_id: user.userId },
          data: { is_default: false },
        });

        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethod.id,
          },
        });
      }

      const existing = await tx.payment_methods.findFirst({
        where: { stripe_payment_method_id: paymentMethod.id },
      });

      if (existing) {
        await tx.payment_methods.update({
          where: { id: existing.id },
          data: {
            brand: paymentMethod.card?.brand,
            last4: paymentMethod.card?.last4,
            exp_month: paymentMethod.card?.exp_month,
            exp_year: paymentMethod.card?.exp_year,
            is_default: makeDefault ? true : existing.is_default,
          },
        });
      } else {
        await tx.payment_methods.create({
          data: {
            user_id: user.userId,
            stripe_customer_id: stripeCustomerId,
            stripe_payment_method_id: paymentMethod.id,
            brand: paymentMethod.card?.brand,
            last4: paymentMethod.card?.last4,
            exp_month: paymentMethod.card?.exp_month,
            exp_year: paymentMethod.card?.exp_year,
            is_default: makeDefault,
          },
        });
      }
    });
  }
}

export const paymentMethodsService = new PaymentMethodsService();
