import { Request, Response, NextFunction } from "express";
import { checkout } from "../services/checkout.service";

export const checkoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { idempotencyKey, couponCode } = req.body;

    const result = await checkout({
      cartId: req.params.cartId as string,
      idempotencyKey,
      couponCode,
    });

    return res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      data: result.order,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (error) {
    next(error);
  }
};