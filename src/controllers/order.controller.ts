import { Request, Response, NextFunction } from "express";
import { getOrderById } from "../services/order.service";

export const getOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const order = await getOrderById(req.params.orderId as string);

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};