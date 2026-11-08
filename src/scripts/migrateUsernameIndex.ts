/**
 * Replaces the legacy unique index on `users.username` with a partial unique
 * index that ignores accounts without a username (invited admins, Google
 * sign-ups).
 *
 * Run once per environment after deploying the model change:
 *   npm run migrate:username-index
 */
import mongoose from "mongoose";
import { MONGO_URL } from "@/config/env";
import User from "@/models/user.model";

const INDEX_NAME = "username_1";

async function main() {
  // The model declares the new partial index; do not let Mongoose attempt to
  // build it before the legacy index has been dropped.
  mongoose.set("autoIndex", false);

  await mongoose.connect(MONGO_URL);

  const indexes = await User.collection.indexes();
  const existing = indexes.find((index) => index.name === INDEX_NAME);

  if (existing?.partialFilterExpression) {
    console.log(`${INDEX_NAME} is already partial; nothing to do`);
  } else {
    if (existing) {
      await User.collection.dropIndex(INDEX_NAME);
      console.log(`Dropped legacy index ${INDEX_NAME}`);
    }

    await User.collection.createIndex(
      { username: 1 },
      {
        unique: true,
        partialFilterExpression: { username: { $type: "string" } },
        name: INDEX_NAME,
      },
    );
    console.log(`Created partial unique index ${INDEX_NAME}`);
  }

  const count = await User.countDocuments({
    $or: [{ username: { $exists: false } }, { username: null }],
  });
  console.log(`Accounts without a username: ${count}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Username index migration failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
