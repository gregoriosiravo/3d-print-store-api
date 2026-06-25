import { Request, Response } from "express";
import {
  PaymentMethodsService,
  paymentMethodsService,
} from "../services/payment-method.service";

class PaymentMethodsController {
  createSetupIntent = async (req: Request, res: Response) => {
    try {
      const result = await paymentMethodsService.createSetupIntent(req.user!);
      return res.status(200).json(result);
    } catch (error: any) {
      return res
        .status(400)
        .json({ message: error.message || "Failed to create setup intent" });
    }
  };

  savePaymentMethod = async (req: Request, res: Response) => {
    try {
      const { paymentMethodId, makeDefault } = req.body;
      await paymentMethodsService.savePaymentMethod(req.user!, makeDefault);
      return res.status(201).json({ message: "Payment method saved" });
    } catch (error: any) {
      return res
        .status(400)
        .json({ message: error.message || "Failed to save payment method" });
    }
  };

  listPaymentMethods = async (req: Request, res: Response) => {};

  setDefaultPaymentMethod = async (req: Request, res: Response) => {};

  deletePaymentMethod = async (req: Request, res: Response) => {};
}

export const paymentMethodsController = new PaymentMethodsController();
