import { Router } from "express";
import { paymentMethodsController } from "../controllers/payment-methods.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All payment-method routes require authentication
router.get(
  "/payment-methods",
  authenticate,
  paymentMethodsController.listPaymentMethods,
);
router.post(
  "/payment-methods/setup-intent",
  authenticate,
  paymentMethodsController.createSetupIntent,
);
router.post(
  "/payment-methods/save",
  authenticate,
  paymentMethodsController.savePaymentMethod,
);
router.put(
  "/payment-methods/:id/default",
  authenticate,
  paymentMethodsController.setDefaultPaymentMethod,
);
router.delete(
  "/payment-methods/:id",
  authenticate,
  paymentMethodsController.deletePaymentMethod,
);

export default router;
