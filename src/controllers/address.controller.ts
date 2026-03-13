import { Request, Response } from "express";
import { AddressService } from "../services/address.service";
import { Address } from "../types/address.types";

export class AddressController {
  private addressService: AddressService;

  constructor() {
    this.addressService = new AddressService();
  }

  async getAddresses(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Not Authenticated, Please log in first!" });
      }
      const userId = req.params.userId;
      if (req.user.userId !== userId) {
        return res.status(403).json({
          error: "Forbidden, You can only access your own addresses!",
        });
      }
      console.log(`Fetching addresses for user ${userId}`);
      const addresses = await this.addressService.getUserAdresses(userId);
      res.status(200).json(addresses);
    } catch (error) {
      console.error(
        "Error fetching addresses:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  }
  async addAddress(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Not Authenticated, Please log in first!" });
      }
      const userId = req.params.userId;
      if (req.user.userId !== userId) {
        return res.status(403).json({
          error: "Forbidden, You can only add addresses to your own account!",
        });
      }
      const addressData = req.body as Address;
      try {
        await this.addressService.addAddress(userId, addressData);
        res.status(201).json({ message: "Address added successfully" });
      } catch (error) {
        res
          .status(400)
          .json({
            error:
              error instanceof Error ? error.message : "Invalid address data",
          });
      }
    } catch (error) {
      console.error(
        "Error adding address:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({ error: "Failed to add address" });
    }
  }

  async deleteAddress(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Not Authenticated, Please log in first!" });
      }
      const userId = req.params.userId;
      const addressId = req.params.addressId;
      if (req.user.userId !== userId) {
        return res.status(403).json({
          error:
            "Forbidden, You can only delete addresses from your own account!",
        });
      }
      await this.addressService.deleteAddress(userId, addressId as string);
      res.status(200).json({ message: "Address deleted successfully" });
    } catch (error) {
      console.error(
        "Error deleting address:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({ error: "Failed to delete address" });
    }
  }
  async setPrimaryAddress(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Not Authenticated, Please log in first!" });
      }
      const userId = req.params.userId;
      const addressId = req.params.addressId;
      if (req.user.userId !== userId) {
        return res.status(403).json({
          error:
            "Forbidden, You can only set primary address for your own account!",
        });
      }
      await this.addressService.setPrimaryAddress(userId, addressId as string);
      res.status(200).json({ message: "Primary address set successfully" });
    } catch (error) {
      console.error(
        "Error setting primary address:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res.status(500).json({ error: "Failed to set primary address" });
    }
  }
}
