import { DELIVERY_PLATFORM_FALLBACK, NODE_ENV } from "@/config/env";
import {
  fetchShipbubbleRates,
  isShipbubbleConfigured,
  validateShipbubbleAddress,
} from "@/services/shipments/provider";
import {
  safePlatformSettings,
  type PlatformSettingsView,
} from "@/services/settings";

/**
 * Delivery quoting for checkout.
 *
 * One quote is produced per vendor fulfilment group. The provider cost is never
 * guessed: when Shipbubble is configured its live rates are authoritative, and
 * when it is not configured the platform's own configured standard delivery
 * rate (`PlatformSetting.shipping`) is used. An address that the live provider
 * cannot serve receives no options at all instead of an invented fee.
 */

export interface DeliveryAddressInput {
  recipientName: string;
  phone: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  country?: string | null;
  email?: string | null;
}

export interface DeliveryStoreInput {
  _id: unknown;
  name: string;
  email?: string | null;
  phoneNumber?: string | null;
  address?: {
    street?: string | null;
    city?: string | null;
    lga?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
}

export interface DeliveryItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface DeliveryOption {
  id: string;
  courier: string;
  service: string | null;
  fee: number;
  currency: "NGN";
  provider: "shipbubble" | "platform";
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  estimatedDeliveryText: string | null;
  note: string | null;
}

export interface StoreDeliveryQuote {
  available: boolean;
  options: DeliveryOption[];
  selectedOptionId: string | null;
  message: string | null;
}

type FetchLike = typeof fetch;

export function normaliseNigerianPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");

  if (compact.startsWith("+234")) return compact;
  if (compact.startsWith("234")) return `+${compact}`;
  if (compact.startsWith("0")) return `+234${compact.slice(1)}`;

  return compact;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function deliveryWindow(option: DeliveryOption, now = new Date()) {
  const days =
    option.estimatedDaysMax ?? option.estimatedDaysMin ?? null;

  return days === null ? null : addDays(now, days);
}

export function estimatedDeliveryAt(
  quote: StoreDeliveryQuote,
  now = new Date(),
) {
  const selected =
    quote.options.find((option) => option.id === quote.selectedOptionId) ??
    quote.options[0] ??
    null;

  return selected ? deliveryWindow(selected, now) : null;
}

export function buildPlatformDeliveryOption(
  settings: PlatformSettingsView,
  subtotal: number,
): DeliveryOption {
  const threshold = settings.shipping.freeShippingThreshold;
  const free =
    threshold !== null && threshold > 0 && subtotal >= threshold;
  const days = Math.max(1, Math.round(settings.shipping.estimatedDeliveryDays));
  const fee = free ? 0 : Math.max(0, Math.round(settings.shipping.defaultDeliveryFee));

  return {
    id: "platform:standard",
    courier: "Routiq delivery",
    service: fee === 0 ? "Standard delivery" : "Standard delivery",
    fee,
    currency: "NGN",
    provider: "platform",
    estimatedDaysMin: days,
    estimatedDaysMax: days,
    estimatedDeliveryText: `${days} ${days === 1 ? "business day" : "business days"}`,
    note:
      fee === 0
        ? free && threshold !== null
          ? `Free delivery on orders from ₦${threshold.toLocaleString("en-NG")}`
          : "Delivery included at the platform's configured rate"
        : null,
  };
}

function unavailable(message: string): StoreDeliveryQuote {
  return {
    available: false,
    options: [],
    selectedOptionId: null,
    message,
  };
}

async function liveQuote(
  store: DeliveryStoreInput,
  address: DeliveryAddressInput,
  items: DeliveryItemInput[],
  fetchImpl: FetchLike,
): Promise<StoreDeliveryQuote> {
  if (!store.address?.street || !store.address?.city) {
    return unavailable(
      "This store has not published a pickup address, so delivery cannot be priced.",
    );
  }

  try {
    const [sender, receiver] = await Promise.all([
      validateShipbubbleAddress(
        {
          name: store.name,
          phone: normaliseNigerianPhone(store.phoneNumber ?? ""),
          email: store.email ?? null,
          street: store.address.street,
          city: store.address.city,
          lga: store.address.lga ?? "",
          state: store.address.state ?? "",
          country: store.address.country ?? "Nigeria",
        },
        fetchImpl,
      ),
      validateShipbubbleAddress(
        {
          name: address.recipientName,
          phone: normaliseNigerianPhone(address.phone),
          email: address.email ?? null,
          street: address.street,
          city: address.city,
          lga: address.lga,
          state: address.state,
          country: address.country ?? "Nigeria",
        },
        fetchImpl,
      ),
    ]);

    if (!sender.addressCode) {
      return unavailable(
        "The store pickup address could not be verified with Shipbubble, so delivery is unavailable for this store.",
      );
    }

    if (!receiver.addressCode) {
      return unavailable(
        "We could not verify this delivery address. Check the street, city and state, then try again.",
      );
    }

    const rates = await fetchShipbubbleRates(
      {
        senderAddressCode: sender.addressCode,
        receiverAddressCode: receiver.addressCode,
        items,
      },
      fetchImpl,
    );

    if (!rates.length) {
      return unavailable(
        "Shipbubble has no delivery option for this address. Try another address or contact support.",
      );
    }

    const options: DeliveryOption[] = rates.map((rate, index) => ({
      id: `shipbubble:${rate.courierId ?? index}:${rate.serviceCode ?? index}`,
      courier: rate.courierName,
      service: rate.serviceType ?? rate.serviceCode ?? null,
      fee: rate.fee,
      currency: "NGN",
      provider: "shipbubble",
      estimatedDaysMin: rate.estimatedDaysMin,
      estimatedDaysMax: rate.estimatedDaysMax,
      estimatedDeliveryText: rate.estimatedDeliveryText,
      note: null,
    }));

    const cheapest = [...options].sort((left, right) => left.fee - right.fee)[0];

    return {
      available: true,
      options,
      selectedOptionId: cheapest?.id ?? null,
      message: null,
    };
  } catch (error) {
    console.error("[delivery] Shipbubble quote failed", {
      store: String(store._id),
      message: error instanceof Error ? error.message : String(error),
    });

    return unavailable(
      "Delivery could not be calculated with Shipbubble right now. Please try again shortly.",
    );
  }
}

async function platformQuote(
  settings: PlatformSettingsView | undefined,
  subtotal: number,
  note?: string | null,
): Promise<StoreDeliveryQuote> {
  const option = buildPlatformDeliveryOption(
    settings ?? (await safePlatformSettings()),
    subtotal,
  );

  return {
    available: true,
    options: [{ ...option, note: note ?? option.note }],
    selectedOptionId: option.id,
    message: null,
  };
}

/**
 * A live provider that is configured but failing blocks checkout by design.
 * This switch exists only so local development and payment testing can proceed
 * while Shipbubble is unreachable; it is never honoured in production.
 */
const developerFallbackEnabled = () =>
  DELIVERY_PLATFORM_FALLBACK && NODE_ENV !== "production";

export async function quoteStoreDelivery(
  store: DeliveryStoreInput,
  address: DeliveryAddressInput,
  items: DeliveryItemInput[],
  options: {
    subtotal: number;
    settings?: PlatformSettingsView;
    fetchImpl?: FetchLike;
  } = { subtotal: 0 },
): Promise<StoreDeliveryQuote> {
  if (isShipbubbleConfigured) {
    const live = await liveQuote(
      store,
      address,
      items,
      options.fetchImpl ?? fetch,
    );

    if (live.available || !developerFallbackEnabled()) {
      return live;
    }

    console.warn(
      "[delivery] Shipbubble could not quote; falling back to the platform delivery rate (development only).",
      { store: String(store._id), reason: live.message },
    );

    return platformQuote(
      options.settings,
      options.subtotal,
      "Platform delivery rate because the courier quote was unavailable (development fallback).",
    );
  }

  return platformQuote(options.settings, options.subtotal);
}

/** Selects a requested option, falling back to the cheapest valid one. */
export function selectDeliveryOption(
  quote: StoreDeliveryQuote,
  requestedId?: string | null,
): DeliveryOption | null {
  if (!quote.available || !quote.options.length) return null;

  if (requestedId) {
    const requested = quote.options.find(
      (option) => option.id === requestedId,
    );
    if (requested) return requested;
  }

  const selected = quote.options.find(
    (option) => option.id === quote.selectedOptionId,
  );

  if (selected) return selected;

  return [...quote.options].sort((left, right) => left.fee - right.fee)[0] ?? null;
}
