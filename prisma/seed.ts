import {
  PrismaClient,
  CartStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning existing database...");

  // Delete child records before parent records.
  await prisma.idempotencyKey.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.product.deleteMany();

  console.log("📦 Seeding products...");

  const products = await prisma.product.createManyAndReturn({
    data: [
      {
        name: "Wireless Noise-Canceling Headphones",
        priceInPaise: 299900,
        stock: 50,
      },
      {
        name: "Mechanical Keyboard",
        priceInPaise: 499900,
        stock: 25,
      },
      {
        name: "USB-C Fast Charger 65W",
        priceInPaise: 149900,
        stock: 100,
      },
      {
        name: "27-inch 4K Monitor",
        priceInPaise: 1599900,
        stock: 15,
      },
      {
        // Intentionally low stock for concurrency / overselling tests.
        name: "Limited Edition Desk Mat",
        priceInPaise: 99900,
        stock: 1,
      },
    ],
  });

  const [
    headphones,
    keyboard,
    charger,
    monitor,
    limitedDeskMat,
  ] = products;

  console.log(`✅ ${products.length} products seeded.`);

  console.log("🎟️ Seeding reward coupon...");

  console.log("🛒 Seeding sample carts...");

  // Normal cart containing multiple products.
  const standardCart = await prisma.cart.create({
    data: {
      status: CartStatus.ACTIVE,
      items: {
        create: [
          {
            productId: headphones.id,
            quantity: 1,
          },
          {
            productId: charger.id,
            quantity: 2,
          },
        ],
      },
    },
    include: {
      items: true,
    },
  });

  // Cart specifically useful for inventory/concurrency testing.
  // Only one unit of this product exists.
  const limitedStockCart = await prisma.cart.create({
    data: {
      status: CartStatus.ACTIVE,
      items: {
        create: [
          {
            productId: limitedDeskMat.id,
            quantity: 1,
          },
        ],
      },
    },
    include: {
      items: true,
    },
  });

  console.log("✅ Sample carts seeded.");

  console.log("\n==========================================");
  console.log("🌱 SEED COMPLETED");
  console.log("==========================================");

  console.log("\n📦 Products:");

  for (const product of products) {
    console.log(
      `- ${product.name} | ₹${(product.priceInPaise / 100).toFixed(
        2
      )} | Stock: ${product.stock} | ID: ${product.id}`
    );
  }


  console.log("\n🛒 Sample carts:");
  console.log(`- Standard cart: ${standardCart.id}`);
  console.log(`- Limited-stock cart: ${limitedStockCart.id}`);

  console.log("\n⚙️ Reward configuration:");
  console.log("- Every 5th successfully placed order");
  console.log("- Generates 1 coupon");
  console.log("- Coupon discount: 10%");
  console.log("==========================================\n");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });