import { describe, expect, it } from "vitest";
import {
  adminWithdrawalDecisionSchema,
  adminWithdrawalListQuerySchema,
  createBankAccountSchema,
  createVendorProductSchema,
  createWithdrawalSchema,
  MIN_WITHDRAWAL_AMOUNT,
  updateVendorProductSchema,
  updateVendorSettingsSchema,
  updateVendorStockSchema,
  vendorOrderStatusSchema,
  vendorProductListQuerySchema,
} from "@/schemas/vendorPortal";

const id = "a".repeat(24);

describe("vendor product schemas", () => {
  it("accepts a minimal product and applies the stock default", () => {
    const parsed = createVendorProductSchema.parse({
      name: "Ankara Tote",
      category: "Bags",
      price: 12500,
      images: ["https://cdn.routiq.test/tote.webp"],
    });

    expect(parsed.stock).toBe(0);
    expect(parsed.price).toBe(12500);
  });

  it("rejects moderation and placement fields the vendor does not own", () => {
    const result = createVendorProductSchema.safeParse({
      name: "Ankara Tote",
      category: "Bags",
      price: 12500,
      status: "approved",
      featured: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires either an absolute stock value or a delta", () => {
    expect(updateVendorStockSchema.safeParse({}).success).toBe(false);
    expect(updateVendorStockSchema.safeParse({ delta: -2 }).success).toBe(true);
  });

  it("keeps product updates partial", () => {
    expect(updateVendorProductSchema.safeParse({ price: 900 }).success).toBe(
      true,
    );
  });

  it("validates inventory filters and sort fields", () => {
    expect(
      vendorProductListQuerySchema.parse({ inventory: "low_stock" }).inventory,
    ).toBe("low_stock");
    expect(
      vendorProductListQuerySchema.safeParse({ sortBy: "vendor" }).success,
    ).toBe(false);
  });
});

describe("vendor order schemas", () => {
  it("only allows vendor-owned transitions", () => {
    expect(vendorOrderStatusSchema.safeParse({ status: "shipped" }).success).toBe(
      false,
    );
    expect(
      vendorOrderStatusSchema.safeParse({ status: "processing" }).success,
    ).toBe(true);
  });
});

describe("withdrawal schemas", () => {
  it("enforces the minimum withdrawal and a full Naira amount", () => {
    expect(
      createWithdrawalSchema.safeParse({
        amount: MIN_WITHDRAWAL_AMOUNT - 1,
        bankAccountId: id,
      }).success,
    ).toBe(false);
    expect(
      createWithdrawalSchema.safeParse({
        amount: MIN_WITHDRAWAL_AMOUNT + 0.5,
        bankAccountId: id,
      }).success,
    ).toBe(false);
    expect(
      createWithdrawalSchema.safeParse({
        amount: MIN_WITHDRAWAL_AMOUNT,
        bankAccountId: id,
      }).success,
    ).toBe(true);
  });

  it("requires a payout reference before an admin can mark a request paid", () => {
    const missing = adminWithdrawalDecisionSchema.safeParse({ action: "paid" });
    expect(missing.success).toBe(false);
  });

  it("defaults the admin scope to all", () => {
    expect(adminWithdrawalListQuerySchema.parse({}).scope).toBe("all");
  });
});

describe("bank account schemas", () => {
  it("accepts a Nigerian 10-digit account", () => {
    const parsed = createBankAccountSchema.parse({
      bankName: "GTBank",
      bankCode: "058",
      accountName: "Ada Obi",
      accountNumber: "0123456789",
    });

    expect(parsed.accountNumber).toBe("0123456789");
  });

  it("rejects short account numbers", () => {
    expect(
      createBankAccountSchema.safeParse({
        bankName: "GTBank",
        bankCode: "058",
        accountName: "Ada Obi",
        accountNumber: "12345",
      }).success,
    ).toBe(false);
  });
});

describe("vendor settings schema", () => {
  it("requires at least one settings group", () => {
    expect(updateVendorSettingsSchema.safeParse({}).success).toBe(false);
    expect(
      updateVendorSettingsSchema.safeParse({ profile: { name: "Ada Obi" } })
        .success,
    ).toBe(true);
  });

  it("rejects fields that belong to the reviewed store application", () => {
    expect(
      updateVendorSettingsSchema.safeParse({
        legalBusinessName: "Ada Ventures Ltd",
      }).success,
    ).toBe(false);
  });
});
