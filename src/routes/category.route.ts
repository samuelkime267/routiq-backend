import { Router } from "express";
import {
  getCategory,
  listCategories,
  listCategoryProducts,
} from "@/controllers/marketplace";
import { optionalAuth } from "@/middleware";

const categoryRouter = Router();

// Public endpoints. `/products` must be declared before `/:categoryId`.
categoryRouter.get("/", optionalAuth, listCategories);
categoryRouter.get("/:categoryId/products", optionalAuth, listCategoryProducts);
categoryRouter.get("/:categoryId", optionalAuth, getCategory);

export default categoryRouter;
