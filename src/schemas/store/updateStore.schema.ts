import { z } from "zod";
import { storeBaseSchema } from "./createStore.schema";

export const updateStoreSchema = storeBaseSchema.partial();

export type UpdateStoreSchemaType = z.infer<typeof updateStoreSchema>;
