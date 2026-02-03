import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { pool } from "../config/database";

const authService = new AuthService();

export class AuthController {
  /**
   * Register new user
   */
  async register(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate input
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required" });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters" });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const result = await authService.register({
        email,
        password,
        firstName,
        lastName,
      });

      res.status(201).json(result);
    } catch (error) {
      console.error("Registration error:", error);

      if (
        error instanceof Error &&
        error.message === "User already exists with this email"
      ) {
        return res.status(409).json({ error: error.message });
      }

      res.status(500).json({ error: "Registration failed" });
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(req: Request, res: Response) {
    try {
      const { token } = req.body;

      if (!token) {
        return res
          .status(400)
          .json({ error: "Verification token is required" });
      }

      const result = await authService.verifyEmail({ token });
      res.json(result);
    } catch (error) {
      console.error("Email verification error:", error);
     
      if (
        error instanceof Error &&
        (error.message === "Invalid verification token" ||
        error.message === "Verification token has expired")
      ) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }

      res.status(500).json({ error: "Email verification failed" });
    }
  }

  /**
   * Resend verification email
   */
  async resendVerification(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const result = await authService.resendVerificationEmail(email);
      res.json(result);
    } catch (error) {
      console.error("Resend verification error:", error);
      if (
        error instanceof Error &&
        (error.message === "User not found" ||
        error.message === "Email is already verified")        
      ) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }

      res.status(500).json({ error: "Failed to resend verification email" });
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required" });
      }

      const result = await authService.login({ email, password });

      res.json(result);
    } catch (error) {
      console.error("Login error:", error);

      if (
        error instanceof Error &&
        error.message === "Invalid email or password"
      ) {
        return res.status(401).json({ error: error.message });
      }

      res.status(500).json({ error: "Login failed" });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const result = await pool.query(
        "SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1",
        [req.user.userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = result.rows[0];

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at,
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  }
}
