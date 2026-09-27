import { Router } from "express";
import { getOrderController } from "../controllers/order.controller";

const router = Router();

router.get("/:orderId", getOrderController);

export default router;