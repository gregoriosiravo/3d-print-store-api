import { Request, Response } from "express";
import { paymentMethodsService } from "../services/payment-method.service";
import { HttpError } from "../utils/http-error";
import { isUuid } from "../utils/is-uuid";

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  // Stripe rejected the request (bad or unknown ID): the client can fix that
  if (String((error as any)?.type ?? "").startsWith("Stripe")) {
    return res.status(400).json({ error: (error as Error).message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

class PaymentMethodsController {
  createSetupIntent = async (req: Request, res: Response) => {
    try {
      const result = await paymentMethodsService.createSetupIntent(
        req.user!.userId,
      );
      return res.status(200).json(result);
    } catch (error) {
      sendError(res, error, "Failed to create setup intent");
    }
  };

  savePaymentMethod = async (req: Request, res: Response) => {
    const { paymentMethodId, makeDefault } = req.body;
    if (!paymentMethodId || typeof paymentMethodId !== "string") {
      return res.status(400).json({ error: "paymentMethodId is required" });
    }
    try {
      await paymentMethodsService.savePaymentMethod(
        req.user!.userId,
        paymentMethodId,
        makeDefault === true,
      );
      return res.status(201).json({ message: "Payment method saved" });
    } catch (error) {
      sendError(res, error, "Failed to save payment method");
    }
  };

  listPaymentMethods = async (req: Request, res: Response) => {
    try {
      const methods = await paymentMethodsService.listPaymentMethods(
        req.user!.userId,
      );
      return res.status(200).json(methods);
    } catch (error) {
      sendError(res, error, "Failed to list payment methods");
    }
  };

  setDefaultPaymentMethod = async (req: Request, res: Response) => {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    try {
      await paymentMethodsService.setDefaultPaymentMethod(
        req.user!.userId,
        req.params.id as string,
      );
      return res.status(200).json({ message: "Default payment method updated" });
    } catch (error) {
      sendError(res, error, "Failed to set default payment method");
    }
  };

  deletePaymentMethod = async (req: Request, res: Response) => {
    if (!isUuid(req.params.id)) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    try {
      await paymentMethodsService.deletePaymentMethod(
        req.user!.userId,
        req.params.id as string,
      );
      return res.status(200).json({ message: "Payment method deleted" });
    } catch (error) {
      sendError(res, error, "Failed to delete payment method");
    }
  };
}

export const paymentMethodsController = new PaymentMethodsController();
