import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { pool } from "../config/database";
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  JwtPayload,
  VerifyEmailRequest,
} from "../types/auth.types";
import { EmailService } from "./email.service";
import crypto from "crypto";

export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly JWT_SECRET = process.env.JWT_SECRET;
  private readonly JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ||
    "7d") as unknown as SignOptions["expiresIn"];
  private emailService: EmailService = new EmailService();

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [data.email],
    );

    if (existingUser.rows.length > 0) {
      throw new Error("User already exists with this email");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date();
    verificationTokenExpires.setHours(verificationTokenExpires.getHours() + 24);

    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, false, $5, $6)
       RETURNING id, email, first_name, last_name`,
      [
        data.email,
        passwordHash,
        data.firstName || null,
        data.lastName || null,
        verificationToken,
        verificationTokenExpires,
      ],
    );

    const user = result.rows[0];

    // Send verification email
    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        verificationToken,
      );
    } catch (error) {
      console.error("Failed to send verification email:", error);
    }

    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
      },
      message:
        "Registration successful! Please check your email to verify your account.",
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(data: VerifyEmailRequest): Promise<{ message: string }> {
    const result = await pool.query(
      `SELECT id, email, first_name, verification_token_expires 
       FROM users 
       WHERE verification_token = $1`,
      [data.token],
    );

    if (result.rows.length === 0) {
      throw new Error("Invalid verification token");
    }

    const user = result.rows[0];

    // Check if token expired
    if (new Date() > new Date(user.verification_token_expires)) {
      throw new Error("Verification token has expired");
    }

    // Update user as verified
    await pool.query(
      `UPDATE users 
       SET email_verified = true, 
           verification_token = NULL, 
           verification_token_expires = NULL 
       WHERE id = $1`,
      [user.id],
    );

    // Send welcome email
    try {
      await this.emailService.sendWelcomeEmail(user.email, user.first_name);
    } catch (error) {
      console.error("Failed to send welcome email:", error);
    }

    return { message: "Email verified successfully!" };
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const result = await pool.query(
      "SELECT id, email, email_verified FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      throw new Error("User not found");
    }

    const user = result.rows[0];

    if (user.email_verified) {
      throw new Error("Email is already verified");
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date();
    verificationTokenExpires.setHours(verificationTokenExpires.getHours() + 24);

    await pool.query(
      `UPDATE users 
       SET verification_token = $1, verification_token_expires = $2 
       WHERE id = $3`,
      [verificationToken, verificationTokenExpires, user.id],
    );

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    return { message: "Verification email sent!" };
  }

  /**
   * Login user
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    // Find user by email
    const result = await pool.query(
      "SELECT id, email, password_hash, first_name, last_name, email_verified  FROM users WHERE email = $1",
      [data.email],
    );

    if (result.rows.length === 0) {
      throw new Error("Invalid email or password");
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
      },
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JwtPayload {
    try {
      if (!this.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
      }
      const decoded = jwt.verify(token, this.JWT_SECRET);

      // Type guard to ensure it's our custom payload
      if (
        typeof decoded === "object" &&
        decoded !== null &&
        "userId" in decoded &&
        "email" in decoded
      ) {
        return decoded as JwtPayload;
      }

      throw new Error("Invalid token payload");
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(payload: JwtPayload): string {
    if (!this.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const options: SignOptions = {
      expiresIn: this.JWT_EXPIRES_IN,
    };

    return jwt.sign(payload, this.JWT_SECRET, options);
  }
}
