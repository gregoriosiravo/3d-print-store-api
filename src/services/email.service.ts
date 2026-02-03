import nodemailer from "nodemailer";
import { Transporter } from "nodemailer";

export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Verify Your Email - 3D Print Shop",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #4CAF50; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to 3D Print Shop!</h2>
            <p>Thank you for registering. Please verify your email address to complete your registration.</p>
            <p>Click the button below to verify your email:</p>
            <a href="${verificationUrl}" class="button">Verify Email</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all;">${verificationUrl}</p>
            <p>This verification link will expire in 24 hours.</p>
            <div class="footer">
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to 3D Print Shop!
        
        Thank you for registering. Please verify your email address to complete your registration.
        
        Verification link: ${verificationUrl}
        
        This link will expire in 24 hours.
        
        If you didn't create an account, you can safely ignore this email.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log("✅ Verification email sent to:", email);
    } catch (error) {
      console.error("❌ Failed to send verification email:", error);
      throw new Error("Failed to send verification email");
    }
  }

  /**
   * Send welcome email after verification
   */
  async sendWelcomeEmail(email: string, firstName?: string): Promise<void> {
    const name = firstName || "there";

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Welcome to 3D Print Shop!",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Hi ${name}! 🎉</h2>
            <p>Your email has been verified successfully!</p>
            <p>You can now:</p>
            <ul>
              <li>Upload STL files and get instant quotes</li>
              <li>Browse our pre-printed products</li>
              <li>Track your orders</li>
            </ul>
            <p>Start exploring: <a href="${process.env.FRONTEND_URL}">Visit 3D Print Shop</a></p>
            <p>Happy printing!</p>
          </div>
        </body>
        </html>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmation(
    email: string,
    orderNumber: string,
    totalAmount: number,
  ): Promise<void> {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Order Confirmation - ${orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Order Confirmation</h2>
            <h3>Thank you for your order!</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
            <p>You can track your order status in your account.</p>
            <p>Thank you for choosing 3D Print Shop!</p>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log("✅ Order confirmation email sent to:", email);
    } catch (error) {
      console.error("❌ Failed to send order confirmation email:", error);
      throw new Error("Failed to send order confirmation email");
    }
  }
}
