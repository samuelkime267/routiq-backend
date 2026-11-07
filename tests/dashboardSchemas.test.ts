import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  dashboardActivityQuerySchema,
  dashboardRangeQuerySchema,
} from "@/schemas/dashboard";

describe("dashboard range query schema", () => {
  it("defaults to the last 7 days", () => {
    expect(dashboardRangeQuerySchema.parse({})).toEqual({ range: "7d" });
  });

  it("accepts every preset and a valid custom range", () => {
    for (const range of ["today", "7d", "30d", "90d"] as const) {
      expect(dashboardRangeQuerySchema.parse({ range }).range).toBe(range);
    }

    expect(
      dashboardRangeQuerySchema.parse({
        range: "custom",
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    ).toMatchObject({ range: "custom", from: "2026-10-01" });
  });

  it("requires both dates for a custom range", () => {
    const result = dashboardRangeQuerySchema.safeParse({
      range: "custom",
      from: "2026-10-01",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].path).toEqual(["from"]);
    }
  });

  it("rejects malformed custom dates and unknown ranges", () => {
    expect(
      dashboardRangeQuerySchema.safeParse({
        range: "custom",
        from: "01/10/2026",
        to: "2026-10-31",
      }).success,
    ).toBe(false);

    expect(dashboardRangeQuerySchema.safeParse({ range: "1y" }).success).toBe(
      false,
    );
  });
});

describe("dashboard activity query schema", () => {
  it("defaults the feed limit and does not require a range", () => {
    expect(dashboardActivityQuerySchema.parse({})).toEqual({ limit: 10 });
  });

  it("coerces and bounds the limit", () => {
    expect(dashboardActivityQuerySchema.parse({ limit: "25" }).limit).toBe(25);
    expect(
      dashboardActivityQuerySchema.safeParse({ limit: "0" }).success,
    ).toBe(false);
    expect(
      dashboardActivityQuerySchema.safeParse({ limit: "51" }).success,
    ).toBe(false);
  });

  it("validates custom ranges when present", () => {
    expect(
      dashboardActivityQuerySchema.safeParse({
        range: "custom",
        from: "2026-10-01",
        to: "2026-10-02",
        limit: "5",
      }).success,
    ).toBe(true);

    expect(
      dashboardActivityQuerySchema.safeParse({ range: "custom" }).success,
    ).toBe(false);
  });
});
