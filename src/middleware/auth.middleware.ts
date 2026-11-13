import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { readToken } from "../utils/session";

const authService = new AuthService();

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

/**
 * Requires a valid session (cookie or Bearer token)
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * Optional authentication: attaches the user when a valid session is present
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = readToken(req);
  if (token) {
    try {
      const payload = authService.verifyToken(token);
      req.user = {
        userId: payload.userId,
        email: payload.email,
      };
    } catch (error) {
      // An invalid token only means "anonymous" for optional routes
    }
  }
  next();
};
