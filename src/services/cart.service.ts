import prisma from "../utils/prisma";
import { AppError } from "../utils/errors";

const validateId = (value: string, fieldName: string) => {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new AppError(
      `INVALID_${fieldName.toUpperCase()}`,
      `${fieldName} is required`,
      400
    );
  }
};

const validateQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(
      "INVALID_QUANTITY",
      "Quantity must be a positive integer",
      400
    );
  }
};

export const createCart = async () => {
  return prisma.cart.create({
    data: {},
  });
};

export const getCartById = async (cartId: string) => {
  validateId(cartId, "cartId");

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!cart) {
    throw new AppError("CART_NOT_FOUND", "Cart not found", 404);
  }

  const items = cart.items.map((item) => ({
    productId: item.productId,
    productName: item.product.name,
    quantity: item.quantity,
    unitPriceInPaise: item.product.priceInPaise,
    lineTotalInPaise: item.quantity * item.product.priceInPaise,
    availableStock: item.product.stock,
  }));

  const subtotalInPaise = items.reduce(
    (total, item) => total + item.lineTotalInPaise,
    0
  );

  return {
    id: cart.id,
    status: cart.status,
    items,
    subtotalInPaise,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};

export const addCartItem = async (
  cartId: string,
  productId: string,
  quantity: number
) => {
  validateId(cartId, "cartId");
  validateId(productId, "productId");
  validateQuantity(quantity);

  return prisma.$transaction(async (tx) => {
    // Lock the cart row so concurrent cart mutations/checkout
    // cannot modify the same cart at the same time.
    const lockedCart = await tx.$queryRaw<
      Array<{ id: string; status: string }>
    >`
      SELECT "id", "status"
      FROM "Cart"
      WHERE "id" = ${cartId}
      FOR UPDATE
    `;

    if (lockedCart.length === 0) {
      throw new AppError("CART_NOT_FOUND", "Cart not found", 404);
    }

    if (lockedCart[0].status !== "ACTIVE") {
      throw new AppError(
        "CART_NOT_ACTIVE",
        "Items cannot be modified after checkout",
        409
      );
    }

    const product = await tx.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new AppError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId,
          productId,
        },
      },
    });

    const newQuantity = (existingItem?.quantity ?? 0) + quantity;

    if (newQuantity > product.stock) {
      throw new AppError(
        "INSUFFICIENT_STOCK",
        `Only ${product.stock} units are currently available`,
        409
      );
    }

    return tx.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId,
          productId,
        },
      },
      update: {
        quantity: newQuantity,
      },
      create: {
        cartId,
        productId,
        quantity,
      },
      include: {
        product: true,
      },
    });
  });
};

export const updateCartItem = async (
  cartId: string,
  productId: string,
  quantity: number
) => {
  validateId(cartId, "cartId");
  validateId(productId, "productId");

  // Quantity 0 means remove the item.
  if (quantity === 0) {
    return removeCartItem(cartId, productId);
  }

  validateQuantity(quantity);

  return prisma.$transaction(async (tx) => {
    const lockedCart = await tx.$queryRaw<
      Array<{ id: string; status: string }>
    >`
      SELECT "id", "status"
      FROM "Cart"
      WHERE "id" = ${cartId}
      FOR UPDATE
    `;

    if (lockedCart.length === 0) {
      throw new AppError("CART_NOT_FOUND", "Cart not found", 404);
    }

    if (lockedCart[0].status !== "ACTIVE") {
      throw new AppError(
        "CART_NOT_ACTIVE",
        "Items cannot be modified after checkout",
        409
      );
    }

    const product = await tx.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new AppError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    if (quantity > product.stock) {
      throw new AppError(
        "INSUFFICIENT_STOCK",
        `Only ${product.stock} units are currently available`,
        409
      );
    }

    const item = await tx.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId,
          productId,
        },
      },
    });

    if (!item) {
      throw new AppError(
        "CART_ITEM_NOT_FOUND",
        "Product is not present in this cart",
        404
      );
    }

    return tx.cartItem.update({
      where: {
        cartId_productId: {
          cartId,
          productId,
        },
      },
      data: {
        quantity,
      },
      include: {
        product: true,
      },
    });
  });
};

export const removeCartItem = async (
  cartId: string,
  productId: string
) => {
  validateId(cartId, "cartId");
  validateId(productId, "productId");

  return prisma.$transaction(async (tx) => {
    const lockedCart = await tx.$queryRaw<
      Array<{ id: string; status: string }>
    >`
      SELECT "id", "status"
      FROM "Cart"
      WHERE "id" = ${cartId}
      FOR UPDATE
    `;

    if (lockedCart.length === 0) {
      throw new AppError("CART_NOT_FOUND", "Cart not found", 404);
    }

    if (lockedCart[0].status !== "ACTIVE") {
      throw new AppError(
        "CART_NOT_ACTIVE",
        "Items cannot be modified after checkout",
        409
      );
    }

    const item = await tx.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId,
          productId,
        },
      },
    });

    if (!item) {
      throw new AppError(
        "CART_ITEM_NOT_FOUND",
        "Product is not present in this cart",
        404
      );
    }

    await tx.cartItem.delete({
      where: {
        cartId_productId: {
          cartId,
          productId,
        },
      },
    });
  });
};