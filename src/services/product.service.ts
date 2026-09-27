import prisma from "../utils/prisma";

export const getProducts = async () => {
  return prisma.product.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });
};

export const getProductById = async (productId: string) => {
  return prisma.product.findUnique({
    where: {
      id: productId,
    },
  });
};