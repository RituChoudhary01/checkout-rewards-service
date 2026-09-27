import { Router } from "express";

import {
  generateCouponController,
  getAdminReportController,
} from "../controllers/admin.controller";

const router = Router();

router.post(
  "/coupons/generate",
  generateCouponController
);

router.get(
  "/report",
  getAdminReportController
);

export default router;