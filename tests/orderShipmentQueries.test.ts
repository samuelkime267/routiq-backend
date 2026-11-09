import { describe, expect, it } from "vitest";
import {
  listOrdersQuerySchema,
  orderShipmentsQuerySchema,
  orderSubOrdersQuerySchema,
  orderTimelineQuerySchema,
} from "@/schemas/order";
import {
  listShipmentsQuerySchema,
  shipmentTrackingQuerySchema,
} from "@/schemas/shipment";
import { hasPermission } from "@/config/permissions";

describe("order and shipment query validation", () => {
  it("defaults order pagination to the first page", () => {
    const query = listOrdersQuerySchema.parse({});

    expect(query).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("coerces pagination and rejects unknown fulfilment states", () => {
    expect(
      listOrdersQuerySchema.parse({ page: "2", limit: "50" }),
    ).toMatchObject({ page: 2, limit: 50 });

    expect(() =>
      listOrdersQuerySchema.parse({ fulfillmentStatus: "teleported" }),
    ).toThrow();
  });

  it("validates nested order collection queries", () => {
    expect(orderTimelineQuerySchema.parse({ page: "3" })).toMatchObject({
      page: 3,
      limit: 50,
    });
    expect(orderSubOrdersQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
    });
    expect(orderShipmentsQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
    });
  });

  it("validates shipment listing and tracking pagination", () => {
    expect(listShipmentsQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(shipmentTrackingQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 50,
    });
  });
});

describe("order and shipment permissions", () => {
  const subject = (adminRole: "OPERATIONS_ADMIN" | "FINANCE_ADMIN" | "SUPPORT_ADMIN" | "CATALOG_ADMIN") =>
    ({ adminRole }) as const;

  it("lets operations view and manage both modules", () => {
    expect(hasPermission(subject("OPERATIONS_ADMIN"), "orders.view")).toBe(
      true,
    );
    expect(hasPermission(subject("OPERATIONS_ADMIN"), "orders.manage")).toBe(
      true,
    );
    expect(hasPermission(subject("OPERATIONS_ADMIN"), "shipments.view")).toBe(
      true,
    );
    expect(
      hasPermission(subject("OPERATIONS_ADMIN"), "shipments.manage"),
    ).toBe(true);
  });

  it("lets finance read orders without managing shipments", () => {
    expect(hasPermission(subject("FINANCE_ADMIN"), "orders.view")).toBe(true);
    expect(hasPermission(subject("FINANCE_ADMIN"), "shipments.view")).toBe(
      false,
    );
  });

  it("lets support read orders but not reach shipment operations", () => {
    expect(hasPermission(subject("SUPPORT_ADMIN"), "orders.view")).toBe(true);
    expect(hasPermission(subject("SUPPORT_ADMIN"), "orders.manage")).toBe(
      false,
    );
    expect(hasPermission(subject("SUPPORT_ADMIN"), "shipments.manage")).toBe(
      false,
    );
  });

  it("keeps catalogue admins out of order logistics", () => {
    expect(hasPermission(subject("CATALOG_ADMIN"), "orders.view")).toBe(false);
    expect(hasPermission(subject("CATALOG_ADMIN"), "shipments.view")).toBe(
      false,
    );
  });
});
