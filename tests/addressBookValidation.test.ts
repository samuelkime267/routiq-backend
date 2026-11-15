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
  isShipbubbleConfigured: true,
  validateShipbubbleAddress: vi.fn(),
}));

import Address from "@/models/address.model";
import { validateShipbubbleAddress } from "@/services/shipments/provider";
import {
  createCustomerAddress,
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

describe("address validation with Shipbubble", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Address.updateMany).mockResolvedValue({} as never);
  });

  it("records a verified address with its provider code and coordinates", async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(0);
    vi.mocked(Address.create).mockResolvedValue(addressDoc());
    vi.mocked(validateShipbubbleAddress).mockResolvedValue({
      addressCode: "ADDR-1",
      latitude: 6.4,
      longitude: 3.4,
    });

    await createCustomerAddress("c1", baseInput);

    expect(validateShipbubbleAddress).toHaveBeenCalledWith({
      name: "Ada Checkout",
      phone: "08012345678",
      street: "4 Freedom Way",
      city: "Lekki",
      lga: "Eti-Osa",
      state: "Lagos",
      country: "Nigeria",
    });
    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        validation: expect.objectContaining({
          provider: "shipbubble",
          status: "valid",
          message: "Address verified with Shipbubble.",
          addressCode: "ADDR-1",
          latitude: 6.4,
          longitude: 3.4,
          validatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("records an invalid verdict but still saves the address", async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(0);
    vi.mocked(Address.create).mockResolvedValue(addressDoc());
    vi.mocked(validateShipbubbleAddress).mockResolvedValue({
      addressCode: null,
      latitude: null,
      longitude: null,
    });

    await createCustomerAddress("c1", baseInput);

    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        validation: expect.objectContaining({
          provider: "shipbubble",
          status: "invalid",
          message:
            "Shipbubble could not verify this address. Check the street, city and state.",
        }),
      }),
    );
  });

  it("saves the address as unverified when the provider fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(Address.countDocuments).mockResolvedValue(0);
    vi.mocked(Address.create).mockResolvedValue(addressDoc());
    vi.mocked(validateShipbubbleAddress).mockRejectedValue(
      new Error("provider timeout"),
    );

    await createCustomerAddress("c1", baseInput);

    expect(Address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        validation: expect.objectContaining({
          provider: "shipbubble",
          status: "unverified",
          message:
            "We could not verify this address with Shipbubble right now. It will be checked again at checkout.",
          addressCode: null,
        }),
      }),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("re-validates an edited address before saving", async () => {
    const target = addressDoc();
    vi.mocked(Address.findOne).mockResolvedValue(target);
    vi.mocked(validateShipbubbleAddress).mockResolvedValue({
      addressCode: "ADDR-2",
      latitude: 6.5,
      longitude: 3.5,
    });

    await updateCustomerAddress("c1", "a1", { street: "8 Admiralty Way" });

    expect(target.street).toBe("8 Admiralty Way");
    expect(validateShipbubbleAddress).toHaveBeenCalledWith(
      expect.objectContaining({ street: "8 Admiralty Way" }),
    );
    expect(target.validation).toMatchObject({
      provider: "shipbubble",
      status: "valid",
      addressCode: "ADDR-2",
    });
    expect(target.save).toHaveBeenCalled();
  });
});
