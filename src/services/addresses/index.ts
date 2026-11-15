import Address, {
  type AddressDocument,
} from "@/models/address.model";
import type {
  CreateAddressInput,
  UpdateAddressInput,
} from "@/schemas/address";
import {
  isShipbubbleConfigured,
  validateShipbubbleAddress,
} from "@/services/shipments/provider";
import { createError } from "@/utils";

/**
 * Saved customer delivery addresses.
 *
 * Address book rules live here so every endpoint applies them consistently:
 * exactly one default address per customer, the first address becomes the
 * default automatically, and deleting the default promotes the most recently
 * used address that remains.
 */

export function toAddressView(address: AddressDocument) {
  return {
    _id: String(address._id),
    label: address.label ?? "Home",
    recipientName: address.recipientName,
    phone: address.phone,
    street: address.street,
    city: address.city,
    lga: address.lga,
    state: address.state,
    country: address.country ?? "Nigeria",
    landmark: address.landmark ?? null,
    postalCode: address.postalCode ?? null,
    isDefault: Boolean(address.isDefault),
    validation: {
      provider: address.validation?.provider ?? null,
      status: address.validation?.status ?? "unverified",
      message: address.validation?.message ?? null,
      validatedAt: address.validation?.validatedAt ?? null,
    },
    lastUsedAt: address.lastUsedAt ?? null,
    createdAt: address.createdAt ?? null,
    updatedAt: address.updatedAt ?? null,
  };
}

type AddressFields = Pick<
  AddressDocument,
  | "recipientName"
  | "phone"
  | "street"
  | "city"
  | "lga"
  | "state"
  | "country"
  | "landmark"
  | "postalCode"
>;

/**
 * Validates an address with Shipbubble when the provider is configured.
 *
 * Provider failures never block saving an address: the customer may be
 * entering it on a flaky connection, and delivery is re-quoted at checkout
 * anyway. The verdict is recorded so the UI can explain a known-bad address.
 */
async function validateAddress(fields: AddressFields) {
  if (!isShipbubbleConfigured) {
    return {
      provider: null,
      status: "unverified" as const,
      message:
        "This address has not been verified. Delivery options are confirmed at checkout.",
      addressCode: null,
      latitude: null,
      longitude: null,
      validatedAt: null,
    };
  }

  try {
    const result = await validateShipbubbleAddress({
      name: fields.recipientName,
      phone: fields.phone,
      street: fields.street,
      city: fields.city,
      lga: fields.lga,
      state: fields.state,
      country: fields.country ?? "Nigeria",
    });

    return {
      provider: "shipbubble",
      status: result.addressCode
        ? ("valid" as const)
        : ("invalid" as const),
      message: result.addressCode
        ? "Address verified with Shipbubble."
        : "Shipbubble could not verify this address. Check the street, city and state.",
      addressCode: result.addressCode,
      latitude: result.latitude,
      longitude: result.longitude,
      validatedAt: new Date(),
    };
  } catch (error) {
    console.error("[addresses] Shipbubble validation failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      provider: "shipbubble",
      status: "unverified" as const,
      message:
        "We could not verify this address with Shipbubble right now. It will be checked again at checkout.",
      addressCode: null,
      latitude: null,
      longitude: null,
      validatedAt: new Date(),
    };
  }
}

async function clearDefault(customerId: string, exceptId?: unknown) {
  await Address.updateMany(
    {
      customer: customerId,
      isDefault: true,
      ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    },
    { $set: { isDefault: false } },
  );
}

export async function listCustomerAddresses(customerId: string) {
  return Address.find({ customer: customerId }).sort({
    isDefault: -1,
    lastUsedAt: -1,
    createdAt: -1,
  });
}

export async function createCustomerAddress(
  customerId: string,
  input: CreateAddressInput,
) {
  const existing = await Address.countDocuments({ customer: customerId });
  const isDefault = input.isDefault === true || existing === 0;
  const validation = await validateAddress({
    recipientName: input.recipientName,
    phone: input.phone,
    street: input.street,
    city: input.city,
    lga: input.lga,
    state: input.state,
    country: input.country ?? "Nigeria",
    landmark: input.landmark ?? null,
    postalCode: input.postalCode ?? null,
  });

  if (isDefault) await clearDefault(customerId);

  try {
    return await Address.create({
      customer: customerId,
      label: input.label || "Home",
      recipientName: input.recipientName,
      phone: input.phone,
      street: input.street,
      city: input.city,
      lga: input.lga,
      state: input.state,
      country: input.country ?? "Nigeria",
      landmark: input.landmark ?? null,
      postalCode: input.postalCode ?? null,
      isDefault,
      validation,
    });
  } catch (error) {
    // The partial unique index is the last line of defence against two default
    // addresses. Retry once after clearing so a race does not surface to the
    // customer as an error.
    if ((error as { code?: number }).code === 11000) {
      await clearDefault(customerId);

      return Address.create({
        customer: customerId,
        label: input.label || "Home",
        recipientName: input.recipientName,
        phone: input.phone,
        street: input.street,
        city: input.city,
        lga: input.lga,
        state: input.state,
        country: input.country ?? "Nigeria",
        landmark: input.landmark ?? null,
        postalCode: input.postalCode ?? null,
        isDefault,
        validation,
      });
    }

    throw error;
  }
}

export async function findCustomerAddress(
  customerId: string,
  addressId: string,
) {
  const address = await Address.findOne({
    _id: addressId,
    customer: customerId,
  });

  if (!address) {
    throw createError("Address not found", 404);
  }

  return address;
}

export async function updateCustomerAddress(
  customerId: string,
  addressId: string,
  input: UpdateAddressInput,
) {
  const address = await findCustomerAddress(customerId, addressId);
  const changes: Array<keyof AddressFields> = [
    "recipientName",
    "phone",
    "street",
    "city",
    "lga",
    "state",
    "country",
    "landmark",
    "postalCode",
  ];
  const addressChanged = changes.some(
    (field) => input[field] !== undefined && input[field] !== address[field],
  );

  if (input.label !== undefined) address.label = input.label || "Home";
  if (input.recipientName !== undefined) {
    address.recipientName = input.recipientName;
  }
  if (input.phone !== undefined) address.phone = input.phone;
  if (input.street !== undefined) address.street = input.street;
  if (input.city !== undefined) address.city = input.city;
  if (input.lga !== undefined) address.lga = input.lga;
  if (input.state !== undefined) address.state = input.state;
  if (input.country !== undefined) address.country = input.country;
  if (input.landmark !== undefined) address.landmark = input.landmark;
  if (input.postalCode !== undefined) address.postalCode = input.postalCode;

  if (input.isDefault === true) {
    await clearDefault(customerId, address._id);
    address.isDefault = true;
  }

  if (addressChanged) {
    address.validation = await validateAddress({
      recipientName: address.recipientName,
      phone: address.phone,
      street: address.street,
      city: address.city,
      lga: address.lga,
      state: address.state,
      country: address.country ?? "Nigeria",
      landmark: address.landmark ?? null,
      postalCode: address.postalCode ?? null,
    }) as typeof address.validation;
  }

  await address.save();

  return address;
}

export async function setDefaultAddress(
  customerId: string,
  addressId: string,
) {
  const address = await findCustomerAddress(customerId, addressId);

  await clearDefault(customerId, address._id);
  address.isDefault = true;
  await address.save();

  return address;
}

export async function deleteCustomerAddress(
  customerId: string,
  addressId: string,
) {
  const address = await findCustomerAddress(customerId, addressId);
  const wasDefault = Boolean(address.isDefault);

  await Address.deleteOne({ _id: address._id, customer: customerId });

  let promotedAddressId: string | null = null;

  if (wasDefault) {
    const next = await Address.findOne({ customer: customerId }).sort({
      lastUsedAt: -1,
      createdAt: -1,
    });

    if (next) {
      next.isDefault = true;
      await next.save();
      promotedAddressId = String(next._id);
    }
  }

  return { deleted: true, promotedAddressId };
}
