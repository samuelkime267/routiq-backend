import crypto from "node:crypto";
import type { ShipmentStatus } from "@/models/shipment.model";

/**
 * Shipbubble's documented shipment states. Unknown values deliberately map to
 * `null`: the sync service records the raw status but refuses to invent an
 * internal state for a value the provider has not documented.
 */
export const SHIPBUBBLE_STATUS_MAP: Record<string, ShipmentStatus> = {
  pending: "pending",
  confirmed: "confirmed",
  picked_up: "picked_up",
  in_transit: "in_transit",
  completed: "delivered",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "failed",
  delivery_failed: "failed",
  returned: "failed",
};

const normalize = (value: string) =>
  value.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function mapShipbubbleStatus(
  rawStatus?: string | null,
): ShipmentStatus | null {
  if (!rawStatus) return null;

  return SHIPBUBBLE_STATUS_MAP[normalize(rawStatus)] ?? null;
}

export function isTerminalShipmentStatus(status: ShipmentStatus) {
  return status === "delivered" || status === "cancelled";
}

export function shipmentStatusRank(status: string) {
  switch (status) {
    case "pending":
      return 1;
    case "confirmed":
      return 2;
    case "picked_up":
      return 3;
    case "in_transit":
      return 4;
    case "delivered":
      return 5;
    default:
      return 0;
  }
}

export interface ShipmentEventKeyInput {
  providerOrderId?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  message?: string | null;
  location?: string | null;
  occurredAt: Date;
}

export function buildShipmentEventKey(input: ShipmentEventKeyInput) {
  return crypto
    .createHash("sha1")
    .update(
      [
        input.providerOrderId ?? "",
        input.trackingNumber ?? "",
        normalize(input.status ?? ""),
        (input.message ?? "").trim(),
        (input.location ?? "").trim(),
        input.occurredAt.toISOString(),
      ].join("|"),
    )
    .digest("hex");
}

export function buildWebhookKey(
  eventType: string,
  providerOrderId: string | null,
  rawBody: string | Buffer,
  payload: unknown,
) {
  const source = payload as Record<string, unknown>;
  const courier = source.courier as
    | { tracking_code?: string | null }
    | undefined;

  // Prefer semantic fields so a retry with equivalent JSON is still treated as
  // the same event. The raw-body hash is a fallback for payloads that carry no
  // status metadata (for example wallet events).
  const semantic = [
    eventType,
    providerOrderId ?? "",
    String(source.status ?? ""),
    String(source.date ?? source.to_be_processed ?? ""),
    String(courier?.tracking_code ?? ""),
    String(source.estimated_delivery ?? source.eta ?? ""),
    String(source.delay_reason ?? ""),
  ].join("|");

  const meaningful = semantic.replace(/\|+$/, "");
  if (meaningful.split("|").some((part, index) => index > 1 && part)) {
    return meaningful;
  }

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

  return `${semantic}::${crypto.createHash("sha256").update(body).digest("hex")}`;
}
