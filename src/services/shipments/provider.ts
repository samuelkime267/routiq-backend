import crypto from "node:crypto";
import {
  SHIPBUBBLE_API_KEY,
  SHIPBUBBLE_BASE_URL,
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
