import {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  generateRewardCoupon,
} from "../services/coupon.service";

import {
  getAdminReport,
} from "../services/report.service";

export const generateCouponController = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const coupon = await generateRewardCoupon();

    return res.status(201).json({
      success: true,
      data: {
        id: coupon.id,
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        milestoneNumber: coupon.milestoneNumber,
        status: coupon.status,
        createdAt: coupon.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminReportController = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const report = await getAdminReport();

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};