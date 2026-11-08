/**
 * Backfills publication state for products created before moderation and
 * publication were separated.
 *
 * Products that were already approved were live in the old model, so they are
 * marked `published`. Everything else starts `unpublished` and is published by
 * its vendor after approval.
 *
 * Run once per environment after deploying the product moderation module:
 *   npm run migrate:product-publication
 */
import mongoose from "mongoose";
import { MONGO_URL } from "@/config/env";
import Product from "@/models/product.model";

async function main() {
  await mongoose.connect(MONGO_URL);

  const published = await Product.updateMany(
    { status: "approved", publicationStatus: { $exists: false } },
    { $set: { publicationStatus: "published" } },
  );

  const unpublished = await Product.updateMany(
    { publicationStatus: { $exists: false } },
    { $set: { publicationStatus: "unpublished" } },
  );

  console.log(`Approved products marked published: ${published.modifiedCount}`);
  console.log(
    `Remaining products marked unpublished: ${unpublished.modifiedCount}`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Product publication migration failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
