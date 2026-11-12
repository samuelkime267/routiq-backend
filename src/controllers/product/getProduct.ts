import type { NextFunction, Request, Response } from "express";
import Product from "@/models/product.model";
import ProductReview from "@/models/productReview.model";
import { getPublicProduct } from "@/services/marketplace/products";
import { PRODUCT_POPULATE } from "@/services/products/query";
import { assertPermission, createError, isActiveAdmin } from "@/utils";

export const getProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isActiveAdmin(req.user)) {
      const result = await getPublicProduct(String(req.params.productId));

      res.status(200).json({
        message: "Product retrieved successfully",
        success: true,
        data: result,
      });
      return;
    }

    assertPermission(req.user, ["products.view"] as const);

    const product = await Product.findById(String(req.params.productId)).populate([
      ...PRODUCT_POPULATE,
    ]);

    if (!product) throw createError("Product not found", 404);

    const history = await ProductReview.find({ product: product._id })
      .populate("actor", "name email adminRole")
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      message: "Product retrieved successfully",
      success: true,
      data: { product, history },
    });
  } catch (error) {
    next(error);
  }
};
