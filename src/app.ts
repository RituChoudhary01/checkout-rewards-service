import express from "express";
import productRoutes from "./routes/product.routes";
import cartRoutes from "./routes/cart.routes";
import checkoutRoutes from "./routes/checkout.routes";
import orderRoutes from "./routes/order.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import adminRoutes from "./routes/admin.routes";
const app = express();


app.use(express.json());
app.set('json spaces', 2);

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Checkout Rewards Service is running",
  });
});

app.use("/api/products", productRoutes);
app.use("/api/carts", cartRoutes);
app.use("/api", checkoutRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use(errorMiddleware);
export default app;