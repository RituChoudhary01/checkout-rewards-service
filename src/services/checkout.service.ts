import prisma from "../utils/prisma";
import { AppError } from "../utils/errors";
import { Prisma } from "@prisma/client";

type CheckoutInput = {
  cartId: string;
  idempotencyKey: string;
  couponCode?: string;
};

export const checkout = async ({
  cartId,
  idempotencyKey,
  couponCode,
}: CheckoutInput) => {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new AppError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key is required",
      400
    );
  }

  if (idempotencyKey.trim().length === 0) {
    throw new AppError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key cannot be empty",
      400
    );
  }

  // Fast path:
  // If this request was already successfully processed,
  // return the same order.
  const existingIdempotency = await prisma.idempotencyKey.findUnique({
    where: {
      key: idempotencyKey,
    },
    include: {
      order: {
        include: {
          items: true,
          coupon: true,
        },
      },
    },
  });

  if (existingIdempotency) {
    return {
      order: existingIdempotency.order,
      idempotentReplay: true,
    };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        /*
         * Lock this cart row.
         *
         * This is important because two checkout requests for the
         * same cart can arrive at the same time.
         *
         * PostgreSQL will make the second transaction wait until
         * the first transaction finishes.
         */
        const lockedCart = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
          }>
        >`
          SELECT "id", "status"
          FROM "Cart"
          WHERE "id" = ${cartId}
          FOR UPDATE
        `;

        if (lockedCart.length === 0) {
          throw new AppError(
            "CART_NOT_FOUND",
            "Cart not found",
            404
          );
        }

        const cart = await tx.cart.findUnique({
          where: {
            id: cartId,
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        if (!cart) {
          throw new AppError(
            "CART_NOT_FOUND",
            "Cart not found",
            404
          );
        }

        /*
         * After the cart lock, check idempotency again.
         *
         * This handles concurrent requests using the same key.
         */
        const existingKey = await tx.idempotencyKey.findUnique({
          where: {
            key: idempotencyKey,
          },
          include: {
            order: {
              include: {
                items: true,
                coupon: true,
              },
            },
          },
        });

        if (existingKey) {
          return {
            order: existingKey.order,
            idempotentReplay: true,
          };
        }

        if (cart.status !== "ACTIVE") {
          throw new AppError(
            "CART_ALREADY_CHECKED_OUT",
            "Cart has already been checked out",
            409
          );
        }

        if (cart.items.length === 0) {
          throw new AppError(
            "EMPTY_CART",
            "Cannot checkout an empty cart",
            400
          );
        }

        let subtotalInPaise = 0;

        /*
         * We use the CURRENT product price at checkout time.
         *
         * The order will store snapshots of these values.
         */
        for (const item of cart.items) {
          if (item.quantity <= 0) {
            throw new AppError(
              "INVALID_CART_ITEM",
              "Cart contains an invalid quantity",
              400
            );
          }

          subtotalInPaise +=
            item.quantity * item.product.priceInPaise;
        }

        let discountInPaise = 0;
        let couponId: string | undefined;

        /*
         * Coupon validation + redemption happens inside
         * the same transaction as order creation.
         */
        if (couponCode) {
          const coupon = await tx.coupon.findUnique({
            where: {
              code: couponCode,
            },
          });

          if (!coupon) {
            throw new AppError(
              "COUPON_NOT_FOUND",
              "Coupon not found",
              404
            );
          }

          if (coupon.status !== "AVAILABLE") {
            throw new AppError(
              "COUPON_ALREADY_REDEEMED",
              "Coupon has already been redeemed",
              409
            );
          }

          /*
           * Integer-only percentage calculation.
           *
           * Example:
           * subtotal = 10000 paise
           * discount = 10%
           * discount = 1000 paise
           *
           * Math.floor makes rounding deterministic.
           */
          discountInPaise = Math.floor(
            (subtotalInPaise * coupon.discountPercent) / 100
          );

          discountInPaise = Math.min(
            discountInPaise,
            subtotalInPaise
          );

          /*
           * Atomic state transition:
           *
           * AVAILABLE -> REDEEMED
           *
           * If another checkout already redeemed it,
           * count will be 0.
           */
          const redeemedCoupon = await tx.coupon.updateMany({
            where: {
              id: coupon.id,
              status: "AVAILABLE",
            },
            data: {
              status: "REDEEMED",
              redeemedAt: new Date(),
            },
          });

          if (redeemedCoupon.count !== 1) {
            throw new AppError(
              "COUPON_ALREADY_REDEEMED",
              "Coupon has already been redeemed",
              409
            );
          }

          couponId = coupon.id;
        }

        const totalInPaise = Math.max(
          0,
          subtotalInPaise - discountInPaise
        );

        /*
         * Inventory update is atomic.
         *
         * stock >= requested quantity is part of the WHERE clause.
         *
         * Therefore two concurrent checkouts cannot oversell
         * the same product.
         */
        for (const item of cart.items) {
          const updatedProduct = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: {
                gte: item.quantity,
              },
            },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });

          if (updatedProduct.count !== 1) {
            throw new AppError(
              "INSUFFICIENT_STOCK",
              `Insufficient stock for product "${item.product.name}"`,
              409
            );
          }
        }

        /*
         * Create the order only after all inventory checks succeed.
         */
        const order = await tx.order.create({
          data: {
            cartId,
            subtotalInPaise,
            discountInPaise,
            totalInPaise,
            couponId,

            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.product.name,
                unitPriceInPaiseSnapshot:
                  item.product.priceInPaise,
                quantity: item.quantity,
                lineTotalInPaise:
                  item.quantity * item.product.priceInPaise,
              })),
            },
          },
          include: {
            items: true,
            coupon: true,
          },
        });

        /*
         * Mark cart as checked out.
         */
        await tx.cart.update({
          where: {
            id: cartId,
          },
          data: {
            status: "CHECKED_OUT",
          },
        });

        /*
         * Store idempotency key -> order mapping.
         */
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            orderId: order.id,
          },
        });

        return {
          order,
          idempotentReplay: false,
        };
      },
      {
        /*
         * Checkout is a critical transaction.
         * Give PostgreSQL enough time for concurrent requests.
         */
        timeout: 10000,
      }
    );

    return result;
  } catch (error) {
    /*
     * If another concurrent request created the same idempotency
     * key first, Prisma will throw a unique constraint error.
     *
     * Fetch the already-created order and return it.
     */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingIdempotency =
        await prisma.idempotencyKey.findUnique({
          where: {
            key: idempotencyKey,
          },
          include: {
            order: {
              include: {
                items: true,
                coupon: true,
              },
            },
          },
        });

      if (existingIdempotency) {
        return {
          order: existingIdempotency.order,
          idempotentReplay: true,
        };
      }
    }

    throw error;
  }
};