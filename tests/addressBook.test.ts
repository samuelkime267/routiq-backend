import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/address.model", () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
  },
}));
vi.mock("@/services/shipments/provider", () => ({
  isShipbubbleConfigured: false,
  validateShipbubbleAddress: vi.fn(),
}));

import Address from "@/models/address.model";
import { validateShipbubbleAddress } from "@/services/shipments/provider";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  findCustomerAddress,
  updateCustomerAddress,
} from "@/services/addresses";

const baseInput = {
  label: "Home",
  recipientName: "Ada Checkout",
  phone: "08012345678",
  street: "4 Freedom Way",
  city: "Lekki",
  lga: "Eti-Osa",
  state: "Lagos",
  country: "Nigeria",
};

const addressDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "a1",
    customer: "c1",
    ...baseInput,
    isDefault: false,
    validation: {
      provider: null,
      status: "unverified",
      message: null,
      addressCode: null,
      latitude: null,
      longitude: null,
      validatedAt: null,
    },
    lastUsedAt: null,
    createdAt: new Date("2026-11-01T09:00:00.000Z"),
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

describe("address book rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Address.updateMany).mockResolvedValue({} as never);
    vi.mocked(Address.deleteOne).mockResolvedValue({} as never);
  });

  it("makes the first saved address the default", async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(0);
    const created = addressDoc({ isDefault: true });
    vi.mocked(Address.create).mockResolvedValue(created);

    const result = await createCustomerAddress("c1", baseInput);

    expect(result).toBe(created);
    expect(Address.updateMany).toHaveBeenCalledWith(
      { customer: "c1", isDefault: true },
      { $set: { isDefault: false } },
    );
    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "c1",
        label: "Home",
        isDefault: true,
        validation: expect.objectContaining({
          provider: null,
          status: "unverified",
        }),
      }),
    );
  });

  it("keeps later addresses non-default unless the customer asks", async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(2);
    vi.mocked(Address.create).mockResolvedValue(addressDoc());

    await createCustomerAddress("c1", baseInput);

    expect(Address.updateMany).not.toHaveBeenCalled();
    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: false }),
    );
  });

  it("clears the previous default when a new address is marked default", async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(2);
    vi.mocked(Address.create).mockResolvedValue(
      addressDoc({ _id: "a2", isDefault: true }),
    );

    await createCustomerAddress("c1", { ...baseInput, isDefault: true });

    expect(Address.updateMany).toHaveBeenCalledWith(
      { customer: "c1", isDefault: true },
      { $set: { isDefault: false } },
    );
    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true }),
    );
  });

  it("never calls Shipbubble and records the address as unverified when it is not configured", async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(0);
    vi.mocked(Address.create).mockResolvedValue(addressDoc());

    await createCustomerAddress("c1", {
      ...baseInput,
      country: undefined as never,
    });

    expect(validateShipbubbleAddress).not.toHaveBeenCalled();
    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "Nigeria",
        validation: expect.objectContaining({
          provider: null,
          status: "unverified",
          message:
            "This address has not been verified. Delivery options are confirmed at checkout.",
        }),
      }),
    );
  });

  it("promotes the most recently used remaining address when the default is deleted", async () => {
    const current = addressDoc({ _id: "a1", isDefault: true });
    const next = addressDoc({ _id: "a2" });
    vi.mocked(Address.findOne)
      .mockResolvedValueOnce(current)
      .mockReturnValueOnce({ sort: async () => next } as never);

    const result = await deleteCustomerAddress("c1", "a1");

    expect(result).toEqual({ deleted: true, promotedAddressId: "a2" });
    expect(Address.deleteOne).toHaveBeenCalledWith({
      _id: "a1",
      customer: "c1",
    });
    expect(next.isDefault).toBe(true);
    expect(next.save).toHaveBeenCalled();
  });

  it("does not promote an address when a non-default one is deleted", async () => {
    vi.mocked(Address.findOne).mockResolvedValueOnce(
      addressDoc({ _id: "a2", isDefault: false }),
    );

    const result = await deleteCustomerAddress("c1", "a2");

    expect(result).toEqual({ deleted: true, promotedAddressId: null });
    expect(Address.findOne).toHaveBeenCalledTimes(1);
  });

  it("switches the default without deleting the other addresses", async () => {
    const target = addressDoc({ _id: "a2" });
    vi.mocked(Address.findOne).mockResolvedValue(target);

    await updateCustomerAddress("c1", "a2", { isDefault: true });

    expect(Address.updateMany).toHaveBeenCalledWith(
      {
        customer: "c1",
        isDefault: true,
        _id: { $ne: "a2" },
      },
      { $set: { isDefault: false } },
    );
    expect(target.isDefault).toBe(true);
    expect(target.save).toHaveBeenCalled();
  });

  it("re-validates only when address fields change", async () => {
    const target = addressDoc({ _id: "a2" });
    vi.mocked(Address.findOne).mockResolvedValue(target);

    await updateCustomerAddress("c1", "a2", { label: "Office" });

    expect(target.label).toBe("Office");
    expect(target.save).toHaveBeenCalled();
    expect(validateShipbubbleAddress).not.toHaveBeenCalled();
  });

  it("hides another customer's address behind a 404", async () => {
    vi.mocked(Address.findOne).mockResolvedValue(null);

    await expect(findCustomerAddress("c1", "a9")).rejects.toMatchObject({
      statusCode: 404,
      message: "Address not found",
    });
  });
});
