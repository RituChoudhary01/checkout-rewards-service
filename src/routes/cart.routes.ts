import { Router } from "express";

import {
  createCartController,
  getCartController,
  addCartItemController,
  updateCartItemController,
  removeCartItemController,
} from "../controllers/cart.controller";

const router = Router();

router.post("/", createCartController);

router.get("/:id", getCartController);

router.post("/:id/items", addCartItemController);

router.patch(
  "/:id/items/:productId",
  updateCartItemController
);

router.delete(
  "/:id/items/:productId",
  removeCartItemController
);

export default router;