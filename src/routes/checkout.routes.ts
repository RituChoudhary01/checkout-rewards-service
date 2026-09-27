import { Router } from "express";
import { checkoutController } from "../controllers/checkout.controller";

const router = Router();

router.post(
  "/carts/:cartId/checkout",
  checkoutController
);

export default router;