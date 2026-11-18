import crypto from "node:crypto";
import mongoose, { type Types } from "mongoose";
import Order from "@/models/order.model";
import Product, {
  type ProductDocument,
  type ProductPublicationStatus,
  type ProductStatus,
} from "@/models/product.model";
import ProductReview from "@/models/productReview.model";
import type { StoreDocument } from "@/models/store.model";
import type { UserDocument } from "@/models/user.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { createError, slugify } from "@/utils";
import { assertVendorCanSell } from "./access";
import type {
  CreateVendorProductInput,
  UpdateVendorProductInput,
  VendorProductListQuery,
} from "@/schemas/vendorPortal";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LOW_STOCK_THRESHOLD = 5;

/** Fields that change what a shopper reads, so approval must be refreshed. */
const MODERATED_FIELDS = [
  "name",
  "category",
  "description",
  "images",
] as const;

export interface VendorProductListResult {
  products: unknown[];
  summary: Record<ProductStatus, number>;
  publicationSummary: Record<ProductPublicationStatus, number>;
  lowStock: number;
  pagination: { page: number; limit: number; total: number; pages: number };
}

function emptyStatusSummary(): Record<ProductStatus, number> {
  return {
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
    archived: 0,
  };
}

function emptyPublicationSummary(): Record<ProductPublicationStatus, number> {
  return { unpublished: 0, published: 0 };
}

/** Vendor catalogue: always scoped by both vendor id and the resolved store. */
export async function queryVendorProducts(
  vendorId: string,
  storeId: string,
  query: VendorProductListQuery,
): Promise<VendorProductListResult> {
  const filter: Record<string, unknown> = { vendor: vendorId, store: storeId };

  if (query.status) filter.status = query.status;
  if (query.publicationStatus) {
    filter.publicationStatus = query.publicationStatus;
  }
  if (query.category) filter.category = query.category;
  if (query.inventory === "out_of_stock") filter.stock = { $lte: 0 };
  if (query.inventory === "low_stock") {
    filter.stock = { $gt: 0, $lte: LOW_STOCK_THRESHOLD };
  }
  if (query.inventory === "in_stock") filter.stock = { $gt: LOW_STOCK_THRESHOLD };
  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), "i");
    filter.$or = [
      { name: pattern },
      { sku: pattern },
      { category: pattern },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const scope = {
    vendor: new mongoose.Types.ObjectId(vendorId),
    store: new mongoose.Types.ObjectId(storeId),
  };

  const [products, total, statusRows, publicationRows, lowStock] =
    await Promise.all([
      Product.find(filter)
        .populate({ path: "store", select: "name slug status logo" })
        .sort({ [query.sortBy]: sortDirection, _id: sortDirection })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      Product.countDocuments(filter),
      Product.aggregate<{ _id: ProductStatus; count: number }>([
        { $match: scope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Product.aggregate<{ _id: ProductPublicationStatus; count: number }>([
        { $match: scope },
        { $group: { _id: "$publicationStatus", count: { $sum: 1 } } },
      ]),
      Product.countDocuments({
        vendor: vendorId,
        store: storeId,
        stock: { $lte: LOW_STOCK_THRESHOLD },
        status: { $ne: "archived" },
      }),
    ]);

  const summary = emptyStatusSummary();
  for (const row of statusRows) {
    if (row._id in summary) summary[row._id] = row.count;
  }

  const publicationSummary = emptyPublicationSummary();
  for (const row of publicationRows) {
    if (row._id in publicationSummary) {
      publicationSummary[row._id] = row.count;
    }
  }

  return {
    products,
    summary,
    publicationSummary,
    lowStock,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function findVendorProduct(
  vendorId: string,
  productId: string,
): Promise<ProductDocument> {
  if (!/^[a-f\d]{24}$/i.test(productId)) {
    throw createError("Product not found", 404);
  }

  const product = await Product.findOne({ _id: productId, vendor: vendorId });

  // A product owned by another vendor is reported as missing, never forbidden:
  // the response must not confirm that someone else's id exists.
  if (!product) throw createError("Product not found", 404);

  return product;
}

export async function getVendorProduct(
  vendorId: string,
  productId: string,
) {
  const product = await findVendorProduct(vendorId, productId);
  const reviews = await ProductReview.find({ product: product._id })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return { product, reviews };
}

async function uniqueSlug(name: string) {
  const base = slugify(name).slice(0, 60) || "product";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `${base}-${suffix}`;

    if (!(await Product.exists({ slug }))) return slug;
  }

  throw createError("Could not allocate a product slug. Please try again.", 500);
}

async function uniqueSku(name: string, requested?: string) {
  if (requested) {
    const sku = requested.trim().toUpperCase();

    if (await Product.exists({ sku })) {
      throw createError("That SKU is already in use", 409);
    }

    return sku;
  }

  const base =
    slugify(name).replace(/-/g, "").slice(0, 10).toUpperCase() || "PRODUCT";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const sku = `RQ-${base}-${crypto.randomInt(1000, 9999)}`;

    if (!(await Product.exists({ sku }))) return sku;
  }

  throw createError("Could not allocate a SKU. Please try again.", 500);
}

function recordReview(
  product: ProductDocument,
  input: {
    action: "submitted";
    fromStatus: ProductStatus;
    toStatus: ProductStatus;
    actorId: Types.ObjectId;
    message: string;
  },
) {
  return ProductReview.create({
    product: product._id,
    action: input.action,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actor: input.actorId,
    actorRole: "vendor",
    message: input.message,
  });
}

export async function createVendorProduct(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  input: CreateVendorProductInput,
) {
  assertVendorCanSell(store);

  const [slug, sku] = await Promise.all([
    uniqueSlug(input.name),
    uniqueSku(input.name, input.sku),
  ]);

  const product = await Product.create({
    store: store._id,
    vendor: vendor._id,
    name: input.name,
    slug,
    sku,
    category: input.category,
    description: input.description ?? null,
    price: input.price,
    compareAtPrice: input.compareAtPrice ?? null,
    stock: input.stock,
    images: input.images,
    status: "draft",
    publicationStatus: "unpublished",
  });

  await recordActivity({
    type: "product_updated",
    channel: "marketplace",
    title: "Product draft created",
    description: `${input.name} was added to the catalogue as a draft.`,
    actor: actorFromUser(vendor),
    subject: { type: "product", id: product._id, label: input.name },
    href: `/products/${product._id}/edit`,
    metadata: { store: String(store._id) },
  });

  return product;
}

function contentChanged(
  product: ProductDocument,
  input: UpdateVendorProductInput,
) {
  return MODERATED_FIELDS.some((field) => {
    if (!(field in input)) return false;

    if (field === "images") {
      const next = input.images ?? [];
      const current = product.images ?? [];
      return (
        next.length !== current.length ||
        next.some((image, index) => image !== current[index])
      );
    }

    const next = (input[field] ?? null) as string | null;
    const current = (product[field] ?? null) as string | null;

    return (next ?? "") !== (current ?? "");
  });
}

export async function updateVendorProduct(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  product: ProductDocument,
  input: UpdateVendorProductInput,
) {
  assertVendorCanSell(store);

  if (product.status === "suspended") {
    throw createError(
      "A suspended product cannot be edited. Contact support if the listing was suspended in error.",
      400,
    );
  }

  if (product.status === "archived") {
    throw createError(
      "An archived product cannot be edited. Create a new listing instead.",
      400,
    );
  }

  const reReview =
    product.status === "approved" && contentChanged(product, input);

  for (const field of [
    "name",
    "category",
    "description",
    "price",
    "compareAtPrice",
    "stock",
    "images",
  ] as const) {
    if (field in input) {
      (product as unknown as Record<string, unknown>)[field] =
        input[field] ?? null;
    }
  }

  if (reReview) {
    product.status = "pending";
    product.publicationStatus = "unpublished";
    product.rejectionReason = null;
    product.reviewedAt = null;
    product.reviewedBy = null;
  }

  await product.save();

  if (reReview) {
    await Promise.all([
      recordReview(product, {
        action: "submitted",
        fromStatus: "approved",
        toStatus: "pending",
        actorId: vendor._id,
        message:
          "Listing content changed after approval, so it was resubmitted for moderation.",
      }),
      recordActivity({
        type: "product_submitted",
        channel: "marketplace",
        title: "Product resubmitted",
        description: `${product.name} changed after approval and is back in the moderation queue.`,
        actor: actorFromUser(vendor),
        subject: { type: "product", id: product._id, label: product.name },
        href: `/products/${product._id}/edit`,
      }),
    ]);
  } else {
    await recordActivity({
      type: "product_updated",
      channel: "marketplace",
      title: "Product updated",
      description: `${product.name} was updated.`,
      actor: actorFromUser(vendor),
      subject: { type: "product", id: product._id, label: product.name },
      href: `/products/${product._id}/edit`,
    });
  }

  return product;
}

export async function updateVendorProductStock(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  product: ProductDocument,
  input: { stock?: number; delta?: number },
) {
  assertVendorCanSell(store);

  if (["suspended", "archived"].includes(product.status)) {
    throw createError(
      "Stock cannot be changed while a product is suspended or archived.",
      400,
    );
  }

  const next =
    input.stock !== undefined
      ? input.stock
      : (product.stock ?? 0) + (input.delta ?? 0);

  if (next < 0) {
    throw createError("Stock cannot be negative", 400);
  }

  product.stock = next;
  await product.save();

  await recordActivity({
    type: "product_updated",
    channel: "marketplace",
    title: "Inventory updated",
    description: `${product.name} stock is now ${next}.`,
    actor: actorFromUser(vendor),
    subject: { type: "product", id: product._id, label: product.name },
    href: `/products`,
    metadata: { stock: next },
  });

  return product;
}

export async function submitVendorProduct(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  product: ProductDocument,
) {
  assertVendorCanSell(store);

  if (!["draft", "rejected"].includes(product.status)) {
    throw createError(
      `Only draft or rejected products can be submitted for review. This product is ${product.status}.`,
      400,
    );
  }

  const fromStatus = product.status;

  product.status = "pending";
  product.publicationStatus = "unpublished";
  product.rejectionReason = null;
  product.reviewedAt = null;
  product.reviewedBy = null;
  await product.save();

  await Promise.all([
    recordReview(product, {
      action: "submitted",
      fromStatus,
      toStatus: "pending",
      actorId: vendor._id,
      message: "Submitted for catalogue review.",
    }),
    recordActivity({
      type: "product_submitted",
      channel: "marketplace",
      title: "Product submitted",
      description: `${product.name} is waiting for catalogue review.`,
      actor: actorFromUser(vendor),
      subject: { type: "product", id: product._id, label: product.name },
      href: `/products/${product._id}/edit`,
    }),
  ]);

  return product;
}

export async function setVendorProductPublication(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  product: ProductDocument,
  publish: boolean,
) {
  assertVendorCanSell(store);

  if (product.status === "suspended") {
    throw createError(
      "A suspended product cannot be published. Resolve the suspension first.",
      400,
    );
  }

  if (product.status === "archived") {
    throw createError("An archived product cannot be published", 400);
  }

  if (publish && product.status !== "approved") {
    throw createError(
      "Only approved products can be published to the marketplace.",
      400,
    );
  }

  product.publicationStatus = publish ? "published" : "unpublished";
  await product.save();

  await recordActivity({
    type: "product_updated",
    channel: "marketplace",
    title: publish ? "Product published" : "Product unpublished",
    description: `${product.name} is now ${publish ? "visible in" : "hidden from"} the marketplace.`,
    actor: actorFromUser(vendor),
    subject: { type: "product", id: product._id, label: product.name },
    href: `/products/${product._id}/edit`,
  });

  return product;
}

export async function archiveVendorProduct(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  product: ProductDocument,
) {
  assertVendorCanSell(store);

  if (product.status === "suspended") {
    throw createError("A suspended product cannot be archived", 400);
  }

  product.status = "archived";
  product.publicationStatus = "unpublished";
  await product.save();

  await recordActivity({
    type: "product_updated",
    channel: "marketplace",
    title: "Product archived",
    description: `${product.name} was archived and removed from the marketplace.`,
    actor: actorFromUser(vendor),
    subject: { type: "product", id: product._id, label: product.name },
    href: `/products`,
  });

  return product;
}

export async function deleteVendorProduct(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  product: ProductDocument,
) {
  assertVendorCanSell(store);

  if (!["draft", "rejected", "archived"].includes(product.status)) {
    throw createError(
      "Only draft, rejected or archived products can be deleted. Archive a live listing instead.",
      400,
    );
  }

  const ordered = await Order.exists({ "items.product": product._id });

  if (ordered) {
    throw createError(
      "This product appears on existing orders, so it cannot be deleted. Archive it instead.",
      409,
    );
  }

  await Promise.all([
    ProductReview.deleteMany({ product: product._id }),
    Product.deleteOne({ _id: product._id }),
  ]);

  await recordActivity({
    type: "product_updated",
    channel: "marketplace",
    title: "Product deleted",
    description: `${product.name} was removed from the catalogue.`,
    actor: actorFromUser(vendor),
    subject: { type: "product", id: product._id, label: product.name },
    href: `/products`,
  });

  return { deleted: true };
}
