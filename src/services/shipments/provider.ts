import crypto from "node:crypto";
import {
  SHIPBUBBLE_API_KEY,
  SHIPBUBBLE_BASE_URL,
  SHIPBUBBLE_CATEGORY_ID,
  SHIPBUBBLE_CONTACT_EMAIL,
} from "@/config/env";
import { createError } from "@/utils";

export const isShipbubbleConfigured = Boolean(SHIPBUBBLE_API_KEY);

export interface ShipbubbleCourier {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tracking_code?: string | null;
  tracking_message?: string | null;
  rider_info?: unknown;
}

export interface ShipbubblePackageStatus {
  status?: string | null;
  datetime?: string | null;
}

export interface ShipbubbleEvent {
  location?: string | null;
  message?: string | null;
  captured?: string | null;
}

export interface ShipbubbleShipmentPayload {
  order_id?: string | null;
  status?: string | null;
  courier?: ShipbubbleCourier | null;
  package_status?: ShipbubblePackageStatus[] | null;
  events?: ShipbubbleEvent[] | null;
  tracking_url?: string | null;
  waybill_document?: string | null;
  date?: string | null;
  estimated_delivery?: string | null;
  eta?: string | null;
  delay_reason?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

interface ShipbubbleResponse<T> {
  status?: string;
  message?: string;
  data?: T;
  errors?: unknown;
}

type FetchLike = typeof fetch;

async function shipbubbleRequest<T>(
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<ShipbubbleResponse<T>> {
  if (!isShipbubbleConfigured) {
    throw createError(
      "Shipbubble is not configured. Set SHIPBUBBLE_API_KEY on the server before using shipment actions.",
      503,
    );
  }

  let response: Response;

  try {
    response = await fetchImpl(`${SHIPBUBBLE_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${SHIPBUBBLE_API_KEY}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    console.error("[shipbubble] request failed", {
      path,
      message: error instanceof Error ? error.message : String(error),
    });

    throw createError(
      "Shipbubble could not be reached. Please try again shortly.",
      502,
    );
  }

  const text = await response.text();
  let body: ShipbubbleResponse<T> | null = null;

  if (text) {
    try {
      body = JSON.parse(text) as ShipbubbleResponse<T>;
    } catch {
      body = null;
    }
  }

  if (!response.ok || body?.status === "failed") {
    const message =
      body?.message ||
      (Array.isArray(body?.errors) ? JSON.stringify(body?.errors) : null) ||
      `Shipbubble returned HTTP ${response.status}`;

    // Provider credentials are never included in the surfaced message.
    throw createError(
      `Shipbubble request failed: ${message}`,
      response.status >= 400 && response.status < 500 ? 400 : 502,
    );
  }

  return body ?? {};
}

export interface ShipmentProviderLookup {
  providerOrderId?: string | null;
  trackingNumber?: string | null;
}

/**
 * Fetch one shipment. Shipbubble exposes a batch lookup by `order_id`, and a
 * paginated list. We use the documented lookup first and fall back to the list
 * only when an older record has no provider order id yet.
 */
export async function fetchShipbubbleShipment(
  shipment: ShipmentProviderLookup,
  fetchImpl: FetchLike = fetch,
): Promise<ShipbubbleShipmentPayload | null> {
  if (shipment.providerOrderId) {
    const body = await shipbubbleRequest<{
      results?: ShipbubbleShipmentPayload[];
      pagination?: unknown;
    }>(
      `/shipping/labels/list/${encodeURIComponent(shipment.providerOrderId)}`,
      {},
      fetchImpl,
    );

    return body.data?.results?.[0] ?? null;
  }

  const body = await shipbubbleRequest<{
    results?: ShipbubbleShipmentPayload[];
    pagination?: unknown;
  }>("/shipping/labels", {}, fetchImpl);

  const results = body.data?.results ?? [];

  return (
    results.find(
      (result) =>
        result.order_id === shipment.trackingNumber ||
        result.courier?.tracking_code === shipment.trackingNumber,
    ) ?? null
  );
}

/**
 * Shipbubble only cancels scheduled shipments whose processing date has not
 * passed. The local status guard in `cancelShipment` prevents calling this for
 * a shipment that is already in transit.
 */
export async function cancelShipbubbleShipment(
  providerOrderId: string,
  fetchImpl: FetchLike = fetch,
) {
  const body = await shipbubbleRequest(
    `/shipping/labels/cancel/${encodeURIComponent(providerOrderId)}`,
    { method: "POST" },
    fetchImpl,
  );

  return body;
}

/**
 * Shipbubble signs webhook bodies with HMAC-SHA512 using the API key. The raw
 * body is required because the signature is over the bytes that were sent.
 */
export function verifyShipbubbleSignature(
  rawBody: Buffer | string,
  signature: string | undefined | null,
  apiKey: string = SHIPBUBBLE_API_KEY,
) {
  if (!apiKey || !signature) return false;

  const provided = signature.replace(/^sha512=/i, "").trim();
  const expected = crypto
    .createHmac("sha512", apiKey)
    .update(typeof rawBody === "string" ? rawBody : rawBody)
    .digest("hex");

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export interface ShipbubbleAddressInput {
  name: string;
  phone: string;
  email?: string | null;
  street: string;
  city: string;
  lga: string;
  state: string;
  country?: string | null;
}

export interface ShipbubbleAddressValidation {
  addressCode: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: unknown;
}

const compact = (parts: Array<string | null | undefined>) =>
  parts.map((part) => (part ?? "").trim()).filter(Boolean).join(", ");

/**
 * Parcel defaults for rate lookups.
 *
 * Shipbubble requires a package dimension and a per-item weight, but Routiq
 * products do not record either yet. These conservative defaults keep quoting
 * possible; they should be replaced with real product weights and dimensions
 * as soon as the catalogue carries them, because both drive the quoted fee.
 */
export const DEFAULT_PACKAGE_DIMENSION = {
  length: 25,
  width: 20,
  height: 15,
};

export const DEFAULT_ITEM_WEIGHT_KG = 0.5;

/**
 * Validates (and geocodes) an address with Shipbubble. Shipbubble issues an
 * `address_code` that the rates endpoint requires, so this is the first step of
 * every live delivery quote.
 */
export async function validateShipbubbleAddress(
  input: ShipbubbleAddressInput,
  fetchImpl: FetchLike = fetch,
): Promise<ShipbubbleAddressValidation> {
  const address = compact([
    input.street,
    input.city,
    input.lga,
    input.state,
    input.country ?? "Nigeria",
  ]);

  const body = await shipbubbleRequest<Record<string, any>>(
    "/shipping/address/validate",
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
        // Shipbubble requires an email on every validation request, and address
        // book entries do not store one, so fall back to the configured contact.
        email: input.email?.trim() || SHIPBUBBLE_CONTACT_EMAIL,
        address,
      }),
    },
    fetchImpl,
  );

  const data = body.data ?? {};
  const coordinates = data.coordinates ?? data.location ?? {};

  return {
    addressCode:
      data.address_code ?? data.addressCode ?? data.code ?? null,
    formattedAddress:
      data.formatted_address ?? data.address ?? data.formattedAddress ?? null,
    latitude: Number.isFinite(Number(coordinates.latitude ?? coordinates.lat))
      ? Number(coordinates.latitude ?? coordinates.lat)
      : null,
    longitude: Number.isFinite(
      Number(coordinates.longitude ?? coordinates.lng ?? coordinates.lon),
    )
      ? Number(coordinates.longitude ?? coordinates.lng ?? coordinates.lon)
      : null,
    raw: data,
  };
}

export interface ShipbubbleRateItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface ShipbubbleRateInput {
  senderAddressCode: string;
  receiverAddressCode: string;
  items: ShipbubbleRateItem[];
}

export interface ShipbubbleRateOption {
  courierId: string | null;
  courierName: string;
  serviceCode: string | null;
  serviceType: string | null;
  fee: number;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  estimatedDeliveryText: string | null;
  raw: unknown;
}

const toNaira = (value: unknown) => {
  const amount = Number(value);

  return Number.isFinite(amount) ? Math.round(amount) : null;
};

const toDays = (value: unknown) => {
  const days = Number(value);

  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : null;
};

/**
 * Retrieves live courier rates for one vendor fulfilment group.
 *
 * Shipbubble's rate payload uses whole Naira for `total`; unknown fields are
 * kept in `raw` so an unexpected provider change can be diagnosed without
 * inventing a fee.
 */
/**
 * Resolves the package category required by the rates endpoint.
 *
 * Shipbubble assigns account-specific category ids, so they are read from the
 * provider instead of hard-coded. `SHIPBUBBLE_CATEGORY_ID` pins one when the
 * catalogue needs a narrower category than the default.
 */
let cachedCategoryId: number | null =
  SHIPBUBBLE_CATEGORY_ID > 0 ? SHIPBUBBLE_CATEGORY_ID : null;
let categoryLookup: Promise<number | null> | null = null;

async function resolveRateCategoryId(
  fetchImpl: FetchLike,
): Promise<number | null> {
  if (cachedCategoryId) return cachedCategoryId;

  categoryLookup ??= (async () => {
    try {
      const body = await shipbubbleRequest<
        Array<{ category_id?: unknown; category?: string }>
      >("/shipping/labels/categories", {}, fetchImpl);

      const rows = Array.isArray(body.data) ? body.data : [];
      const preferred =
        rows.find((row) =>
          /electronic|light weight/i.test(String(row.category ?? "")),
        ) ?? rows[0];
      const id = Number(preferred?.category_id);

      cachedCategoryId = Number.isFinite(id) && id > 0 ? id : null;

      return cachedCategoryId;
    } catch (error) {
      categoryLookup = null;
      throw error;
    }
  })();

  return categoryLookup;
}

export async function fetchShipbubbleRates(
  input: ShipbubbleRateInput,
  fetchImpl: FetchLike = fetch,
): Promise<ShipbubbleRateOption[]> {
  const categoryId = await resolveRateCategoryId(fetchImpl);

  if (!categoryId) {
    throw createError(
      "Shipbubble did not return a package category to quote with.",
      502,
    );
  }

  const body = await shipbubbleRequest<Record<string, any>>(
    "/shipping/fetch_rates",
    {
      method: "POST",
      body: JSON.stringify({
        sender_address_code: input.senderAddressCode,
        // Shipbubble's documented field name retains this spelling.
        reciever_address_code: input.receiverAddressCode,
        pickup_date: new Date().toISOString().slice(0, 10),
        category_id: categoryId,
        package_dimension: DEFAULT_PACKAGE_DIMENSION,
        package_items: input.items.map((item) => ({
          name: item.name,
          description: item.name,
          quantity: item.quantity,
          unit_weight: String(DEFAULT_ITEM_WEIGHT_KG),
          unit_amount: item.unitPrice,
        })),
      }),
    },
    fetchImpl,
  );

  const data = body.data ?? {};
  const rows: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data.couriers)
      ? data.couriers
      : Array.isArray(data.rates)
        ? data.rates
        : [];

  return rows.flatMap((row) => {
    const fee =
      toNaira(row.total ?? row.amount ?? row.rate ?? row.fee ?? row.price) ?? null;
    const courierName =
      row.courier_name ?? row.courier?.name ?? row.name ?? row.courier ?? null;

    if (fee === null || !courierName) return [];

    const etaMin =
      toDays(row.delivery_eta_min ?? row.min_delivery_days ?? row.eta_min) ??
      null;
    const etaMax =
      toDays(row.delivery_eta_max ?? row.max_delivery_days ?? row.eta_max) ??
      null;

    return [
      {
        courierId:
          row.courier_id === undefined || row.courier_id === null
            ? null
            : String(row.courier_id),
        courierName: String(courierName),
        serviceCode: row.service_code ?? row.service ?? null,
        serviceType: row.service_type ?? row.type ?? null,
        fee,
        estimatedDaysMin: etaMin,
        estimatedDaysMax: etaMax,
        estimatedDeliveryText:
          row.delivery_eta ?? row.eta ?? row.estimated_delivery ?? null,
        raw: row,
      },
    ];
  });
}
