import { Request, Response } from "express";
import { AddressService } from "../services/address.service";
import { Address } from "../types/address.types";
import { HttpError } from "../utils/http-error";
import { isUuid } from "../utils/is-uuid";
import { hasAddressFields } from "../utils/address-fields";

const addressService = new AddressService();

// Every route here needs a session, and :userId must be the session's user
function ownUserId(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (req.user.userId !== req.params.userId) {
    res.status(403).json({ error: "You can only manage your own addresses" });
    return null;
  }
  return req.user.userId;
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

export class AddressController {
  async getAddresses(req: Request, res: Response) {
    const userId = ownUserId(req, res);
    if (!userId) return;
    try {
      const addresses = await addressService.getUserAddresses(userId);
      res.json(addresses);
    } catch (error) {
      sendError(res, error, "Failed to fetch addresses");
    }
  }

  async addAddress(req: Request, res: Response) {
    const userId = ownUserId(req, res);
    if (!userId) return;
    if (!hasAddressFields(req.body)) {
      return res.status(400).json({
        error: "firstName, lastName, address, city, zip and country are required",
      });
    }
    try {
      await addressService.addAddress(userId, req.body as Address);
      res.status(201).json({ message: "Address added successfully" });
    } catch (error) {
      sendError(res, error, "Failed to add address");
    }
  }

  async editAddress(req: Request, res: Response) {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const addressId = req.params.addressId as string;
    if (!isUuid(addressId)) {
      return res.status(404).json({ error: "Address not found" });
    }
    if (!hasAddressFields(req.body)) {
      return res.status(400).json({
        error: "firstName, lastName, address, city, zip and country are required",
      });
    }
    try {
      await addressService.editAddress(userId, addressId, req.body as Address);
      res.json({ message: "Address edited successfully" });
    } catch (error) {
      sendError(res, error, "Failed to edit address");
    }
  }

  async setPrimaryAddress(req: Request, res: Response) {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const addressId = req.params.addressId as string;
    if (!isUuid(addressId)) {
      return res.status(404).json({ error: "Address not found" });
    }
    try {
      await addressService.setPrimaryAddress(userId, addressId);
      res.json({ message: "Primary address set successfully" });
    } catch (error) {
      sendError(res, error, "Failed to set primary address");
    }
  }

  async deleteAddress(req: Request, res: Response) {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const addressId = req.params.addressId as string;
    if (!isUuid(addressId)) {
      return res.status(404).json({ error: "Address not found" });
    }
    try {
      await addressService.deleteAddress(userId, addressId);
      res.json({ message: "Address deleted successfully" });
    } catch (error) {
      sendError(res, error, "Failed to delete address");
    }
  }
}
