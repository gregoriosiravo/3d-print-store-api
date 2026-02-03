import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();
const authController = new AuthController();

// Public routes
router.post("/register", authController.register.bind(authController));
router.post("/login", authController.login.bind(authController));
router.post("/verify-email", authController.verifyEmail.bind(authController));
router.post(
  "/resend-verification",
  authController.resendVerification.bind(authController),
);

// Protected routes
router.get(
  "/profile",
  authenticate,
  authController.getProfile.bind(authController),
);

export default router;
