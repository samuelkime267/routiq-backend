import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketLabel,
  parseDateKey,
  percentageChange,
  previousRange,
  rangeBuckets,
  resolveDashboardRange,
  startOfLagosDay,
  startOfLagosHour,
} from "@/services/dashboard/range";

const NOW = new Date("2026-11-04T12:00:00.000Z"); // 13:00 in Lagos

describe("dashboard range resolution", () => {
  it("defaults to the last 7 Lagos calendar days", () => {
    const range = resolveDashboardRange({}, NOW);

    expect(range.key).toBe("7d");
    expect(range.granularity).toBe("day");
    expect(range.start.toISOString()).toBe("2026-10-28T23:00:00.000Z");
    expect(range.end).toEqual(NOW);
    expect(rangeBuckets(range)).toHaveLength(7);
  });

  it("buckets today by hour from the start of the Lagos day", () => {
    const range = resolveDashboardRange({ range: "today" }, NOW);
    const buckets = rangeBuckets(range);

    expect(range.granularity).toBe("hour");
    expect(range.start.toISOString()).toBe("2026-11-03T23:00:00.000Z");
    expect(buckets).toHaveLength(13);
    expect(bucketKey(buckets[0], "hour")).toBe("2026-11-04T00");
    expect(bucketKey(buckets[12], "hour")).toBe("2026-11-04T12");
  });

  it("keeps 7d, 30d and 90d ranges equal to their bucket count", () => {
    for (const [key, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      const range = resolveDashboardRange({ range: key }, NOW);

      expect(range.label).toBe(`Last ${days} days`);
      expect(rangeBuckets(range)).toHaveLength(days);
    }
  });

  it("resolves inclusive custom calendar days in Lagos", () => {
    const range = resolveDashboardRange(
      { range: "custom", from: "2026-10-01", to: "2026-10-31" },
      NOW,
    );

    expect(range.start.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(range.granularity).toBe("day");
    expect(range.label).toContain("1 Oct 2026");
    expect(rangeBuckets(range)).toHaveLength(31);
  });

  it("uses hourly buckets for single-day and two-day custom ranges", () => {
    expect(
      resolveDashboardRange(
        { range: "custom", from: "2026-10-01", to: "2026-10-01" },
        NOW,
      ).granularity,
    ).toBe("hour");

    expect(
      resolveDashboardRange(
        { range: "custom", from: "2026-10-01", to: "2026-10-02" },
        NOW,
      ).granularity,
    ).toBe("hour");

    expect(
      resolveDashboardRange(
        { range: "custom", from: "2026-10-01", to: "2026-10-03" },
        NOW,
      ).granularity,
    ).toBe("day");
  });

  it("clamps a custom range that includes today to now", () => {
    const range = resolveDashboardRange(
      { range: "custom", from: "2026-11-04", to: "2026-11-04" },
      NOW,
    );

    expect(range.start.toISOString()).toBe("2026-11-03T23:00:00.000Z");
    expect(range.end).toEqual(NOW);
  });

  it("rejects incomplete, impossible, inverted and future custom ranges", () => {
    expect(() =>
      resolveDashboardRange({ range: "custom", from: "2026-10-01" }, NOW),
    ).toThrow(/start and an end date/);

    expect(() =>
      resolveDashboardRange(
        { range: "custom", from: "2026-02-30", to: "2026-03-01" },
        NOW,
      ),
    ).toThrow(/does not exist/);

    expect(() =>
      resolveDashboardRange(
        { range: "custom", from: "2026-10-05", to: "2026-10-01" },
        NOW,
      ),
    ).toThrow(/on or before/);

    expect(() =>
      resolveDashboardRange(
        { range: "custom", from: "2026-12-01", to: "2026-12-02" },
        NOW,
      ),
    ).toThrow(/future/);
  });

  it("caps custom ranges at one year", () => {
    expect(() =>
      resolveDashboardRange(
        { range: "custom", from: "2025-01-01", to: "2026-11-01" },
        NOW,
      ),
    ).toThrow(/limited to 366 days/);
  });

  it("formats bucket keys and labels in the business timezone", () => {
    const instant = new Date("2026-11-04T09:15:00.000Z"); // 10:15 Lagos

    expect(bucketKey(instant, "day")).toBe("2026-11-04");
    expect(bucketKey(instant, "hour")).toBe("2026-11-04T10");
    expect(bucketLabel("2026-11-04", "day")).toBe("4 Nov");
    expect(bucketLabel("2026-11-04T10", "hour")).toBe("10:00");
  });

  it("derives the equal-length previous window", () => {
    const range = resolveDashboardRange({ range: "7d" }, NOW);
    const previous = previousRange(range);

    expect(previous.end).toEqual(range.start);
    expect(previous.start.toISOString()).toBe("2026-10-22T10:00:00.000Z");
  });

  it("computes percentage change without dividing by zero", () => {
    expect(percentageChange(100, 80)).toBe(25);
    expect(percentageChange(80, 100)).toBe(-20);
    expect(percentageChange(0, 0)).toBe(0);
    expect(percentageChange(10, 0)).toBeNull();
  });

  it("parses valid dates and exposes Lagos day/hour boundaries", () => {
    expect(parseDateKey("2026-11-04").toISOString()).toBe(
      "2026-11-04T00:00:00.000Z",
    );
    expect(startOfLagosDay(NOW).toISOString()).toBe(
      "2026-11-03T23:00:00.000Z",
    );
    expect(startOfLagosHour(NOW).toISOString()).toBe(
      "2026-11-04T12:00:00.000Z",
    );
  });
});
