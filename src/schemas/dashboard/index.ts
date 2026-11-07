import { z } from "zod";
import { DASHBOARD_RANGES } from "@/services/dashboard/range";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const rangeShape = {
  range: z.enum(DASHBOARD_RANGES).default("7d"),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
};

type RangeInput = {
  range: (typeof DASHBOARD_RANGES)[number];
  from?: string;
  to?: string;
};

function validateCustomRange(value: RangeInput, ctx: z.RefinementCtx) {
  if (value.range !== "custom") return;

  if (!value.from || !value.to) {
    ctx.addIssue({
      code: "custom",
      path: ["from"],
      message: "A custom range needs both a start and an end date",
    });
    return;
  }

  if (!DATE_KEY.test(value.from)) {
    ctx.addIssue({
      code: "custom",
      path: ["from"],
      message: "Use the YYYY-MM-DD format for the start date",
    });
  }

  if (!DATE_KEY.test(value.to)) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "Use the YYYY-MM-DD format for the end date",
    });
  }
}

export const dashboardRangeQuerySchema = z
  .object(rangeShape)
  .superRefine(validateCustomRange);

export const dashboardActivityQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    ...rangeShape,
    range: z.enum(DASHBOARD_RANGES).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.range === "custom") {
      validateCustomRange({ ...value, range: "custom" }, ctx);
    }
  });

export type DashboardRangeQuery = z.infer<typeof dashboardRangeQuerySchema>;
export type DashboardActivityQuery = z.infer<
  typeof dashboardActivityQuerySchema
>;
