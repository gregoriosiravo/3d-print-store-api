import { Router } from "express";
import { AddressController } from "../controllers/address.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();
const addressController = new AddressController();

// All address routes require authentication
router.get(
  "/address/:userId/addresses",
  authenticate,
  addressController.getAddresses.bind(addressController),
);
router.post(
  "/address/:userId/add",
  authenticate,
  addressController.addAddress.bind(addressController),
);
router.patch(
  "/address/:userId/addresses/:addressId/primary",
  authenticate,
  addressController.setPrimaryAddress.bind(addressController),
);
router.delete(
  "/address/:userId/addresses/:addressId",
  authenticate,
  addressController.deleteAddress.bind(addressController),
);
export default router;
