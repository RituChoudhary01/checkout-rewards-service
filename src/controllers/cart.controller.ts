import { Request, Response, NextFunction } from "express";
import {
  createCart,
  getCartById,
  addCartItem,
  updateCartItem,
  removeCartItem,
} from "../services/cart.service";

export const createCartController = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cart = await createCart();

    return res.status(201).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

export const getCartController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const cart = await getCartById(req.params.id as string);

    return res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

export const addCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { productId, quantity } = req.body;

    const item = await addCartItem(
      req.params.id as string,
      productId,
      quantity
    );

    return res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { quantity } = req.body;

    const item = await updateCartItem(
      req.params.id as string,
      req.params.productId as string,
      quantity
    );

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const removeCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await removeCartItem(
      req.params.id as string,
      req.params.productId as string
    );

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};