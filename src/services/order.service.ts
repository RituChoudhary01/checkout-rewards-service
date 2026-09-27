import prisma from "../utils/prisma";
import { AppError } from "../utils/errors";

export const getOrderById = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: true,
      coupon: true,
    },
  });

  if (!order) {
    throw new AppError(
      "ORDER_NOT_FOUND",
      "Order not found",
      404
    );
  }

  return {
    id: order.id,
    cartId: order.cartId,

    subtotalInPaise: order.subtotalInPaise,
    discountInPaise: order.discountInPaise,
    totalInPaise: order.totalInPaise,

    coupon: order.coupon
      ? {
          id: order.coupon.id,
          code: order.coupon.code,
          discountPercent: order.coupon.discountPercent,
          status: order.coupon.status,
          redeemedAt: order.coupon.redeemedAt,
        }
      : null,

    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      unitPriceInPaise: item.unitPriceInPaiseSnapshot,
      quantity: item.quantity,
      lineTotalInPaise: item.lineTotalInPaise,
    })),

    createdAt: order.createdAt,
  };
};