import { Router } from "express";
import {
  getAllProducts,
  getProduct,
} from "../controllers/product.controller";

const router = Router();

router.get("/", getAllProducts);
router.get("/:id", getProduct);

export default router;