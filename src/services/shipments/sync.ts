import Order from "@/models/order.model";
import Shipment, {
  type ShipmentDocument,
  type ShipmentStatus,
} from "@/models/shipment.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { createError } from "@/utils";
import {
  fetchShipbubbleShipment,
  cancelShipbubbleShipment,
  type ShipbubbleShipmentPayload,
} from "./provider";
import {
  buildShipmentEventKey,
  isTerminalShipmentStatus,
  mapShipbubbleStatus,
} from "./status";
import { nextOrderStatusFromShipment } from "@/services/orders/status";

export interface ShipmentEventLike {
  key: string;
  status?: string | null;
  message?: string | null;
  location?: string | null;
  occurredAt: Date;
  source?: string;
  receivedAt?: Date;
}

export interface ShipmentCourierLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  trackingCode?: string | null;
  trackingMessage?: string | null;
}

export interface ShipmentLike {
  _id?: unknown;
  order?: unknown;
  trackingNumber: string;
  provider?: string | null;
  providerOrderId?: string | null;
  providerStatus?: string | null;
  status: ShipmentStatus;
  failureReason?: string | null;
  estimatedDeliveryAt?: Date | null;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  lastEventAt?: Date | null;
  trackingUrl?: string | null;
  courier?: ShipmentCourierLike | null;
  events?: ShipmentEventLike[];
  providerResponse?: unknown;
  providerError?: string | null;
  lastSyncedAt?: Date | null;
  lastSyncAttemptAt?: Date | null;
  syncAttempts?: number;
  lastWebhookAt?: Date | null;
  save?: () => Promise<unknown>;
}

export interface ApplyProviderResult {
  changed: boolean;
  statusChanged: boolean;
  fromStatus: ShipmentStatus;
  toStatus: ShipmentStatus;
  eventsAdded: number;
  providerOrderId: string | null;
  mappedStatus: ShipmentStatus | null;
}

function parseProviderDate(value?: string | null): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Shipbubble uses both ISO strings and `YYYY-MM-DD HH:mm:ss` values.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(" ", "T")
    : trimmed;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(dates: Array<Date | null | undefined>): Date | null {
  return dates.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;

    return value > latest ? value : latest;
  }, null);
}

function candidateEvents(
  shipment: ShipmentLike,
  payload: ShipbubbleShipmentPayload,
  now: Date,
  source: string,
) {
  const providerOrderId = payload.order_id ?? shipment.providerOrderId ?? null;
  const events: ShipmentEventLike[] = [];

  for (const entry of payload.package_status ?? []) {
    const occurredAt = parseProviderDate(entry.datetime);
    if (!occurredAt) continue;

    const message = entry.status ? `Package status: ${entry.status}` : null;

    events.push({
      key: buildShipmentEventKey({
        providerOrderId,
        trackingNumber: shipment.trackingNumber,
        status: entry.status ?? null,
        message,
        occurredAt,
      }),
      status: entry.status ?? null,
      message,
      occurredAt,
      source,
      receivedAt: now,
    });
  }

  for (const entry of payload.events ?? []) {
    const occurredAt = parseProviderDate(entry.captured);
    if (!occurredAt) continue;

    events.push({
      key: buildShipmentEventKey({
        providerOrderId,
        trackingNumber: shipment.trackingNumber,
        status: null,
        message: entry.message ?? null,
        location: entry.location ?? null,
        occurredAt,
      }),
      status: null,
      message: entry.message ?? null,
      location: entry.location ?? null,
      occurredAt,
      source,
      receivedAt: now,
    });
  }

  if (payload.status) {
    const occurredAt = parseProviderDate(payload.date) ?? now;

    events.push({
      key: buildShipmentEventKey({
        providerOrderId,
        trackingNumber: shipment.trackingNumber,
        status: payload.status,
        message: `Shipbubble status: ${payload.status}`,
        occurredAt,
      }),
      status: payload.status,
      message: `Shipbubble status: ${payload.status}`,
      occurredAt,
      source,
      receivedAt: now,
    });
  }

  return events;
}

/**
 * Pure application of a provider payload onto a shipment. The caller saves the
 * document. Keeping this pure makes status mapping, event deduplication and
 * failure handling straightforward to test without a database.
 */
export function applyProviderShipment(
  shipment: ShipmentLike,
  payload: ShipbubbleShipmentPayload,
  options: { now?: Date; source?: string } = {},
): ApplyProviderResult {
  const now = options.now ?? new Date();
  const source = options.source ?? "provider";
  const fromStatus = shipment.status;
  const mappedStatus = mapShipbubbleStatus(payload.status);
  const providerOrderId = payload.order_id ?? shipment.providerOrderId ?? null;

  const existingEvents = shipment.events ?? [];
  const existingKeys = new Set(existingEvents.map((event) => event.key));
  const newEvents = candidateEvents(shipment, payload, now, source).filter(
    (event) => {
      if (existingKeys.has(event.key)) return false;
      existingKeys.add(event.key);
      return true;
    },
  );

  const mergedEvents = [...existingEvents, ...newEvents]
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
    .slice(-500);

  const latestEvent = latestDate(mergedEvents.map((event) => event.occurredAt));

  shipment.providerOrderId = providerOrderId;
  shipment.providerStatus = payload.status ?? shipment.providerStatus ?? null;
  shipment.providerResponse = payload;
  shipment.providerError = null;
  shipment.lastSyncedAt = now;
  shipment.lastSyncAttemptAt = now;
  shipment.syncAttempts = (shipment.syncAttempts ?? 0) + 1;
  shipment.events = mergedEvents;
  shipment.trackingUrl = payload.tracking_url ?? shipment.trackingUrl ?? null;
  shipment.courier = payload.courier
    ? {
        name: payload.courier.name ?? shipment.courier?.name ?? null,
        email: payload.courier.email ?? shipment.courier?.email ?? null,
        phone: payload.courier.phone ?? shipment.courier?.phone ?? null,
        trackingCode:
          payload.courier.tracking_code ??
          shipment.courier?.trackingCode ??
          null,
        trackingMessage:
          payload.courier.tracking_message ??
          shipment.courier?.trackingMessage ??
          null,
      }
    : (shipment.courier ?? null);

  if (mappedStatus) {
    shipment.status = mappedStatus;

    if (mappedStatus === "delivered") {
      shipment.deliveredAt =
        parseProviderDate(payload.date) ?? latestEvent ?? now;
      shipment.failureReason = null;
    } else if (mappedStatus === "failed") {
      shipment.failureReason =
        payload.reason ??
        payload.courier?.tracking_message ??
        mergedEvents[mergedEvents.length - 1]?.message ??
        "Shipbubble reported the shipment as failed.";
    } else if (mappedStatus === "cancelled") {
      shipment.cancelledAt = shipment.cancelledAt ?? now;
      shipment.failureReason = null;
    } else {
      shipment.failureReason = null;
    }
  }

  const estimatedDeliveryAt =
    parseProviderDate(payload.estimated_delivery) ??
    parseProviderDate(payload.eta);

  if (estimatedDeliveryAt) {
    shipment.estimatedDeliveryAt = estimatedDeliveryAt;
  }

  shipment.lastEventAt = latestDate([
    shipment.lastEventAt,
    latestEvent,
    mergedEvents.length ? now : null,
  ]);

  return {
    changed:
      mappedStatus !== null ||
      newEvents.length > 0 ||
      providerOrderId !== null,
    statusChanged: mappedStatus !== null && mappedStatus !== fromStatus,
    fromStatus,
    toStatus: mappedStatus ?? fromStatus,
    eventsAdded: newEvents.length,
    providerOrderId,
    mappedStatus,
  };
}

async function syncOrderStatus(shipment: ShipmentDocument) {
  const order = await Order.findById(shipment.order);

  if (!order) return null;

  const nextStatus = nextOrderStatusFromShipment(order.status, shipment.status);
  if (!nextStatus) return order;

  order.status = nextStatus;
  if (nextStatus === "delivered") {
    order.deliveredAt = shipment.deliveredAt ?? new Date();
  }

  const eventType =
    nextStatus === "delivered"
      ? "delivered"
      : shipment.status === "picked_up"
        ? "picked_up"
        : "in_transit";

  order.timeline = order.timeline ?? [];
  const occurredAt = shipment.deliveredAt ?? shipment.lastEventAt ?? new Date();
  const alreadyRecorded = order.timeline.some(
    (event) =>
      event.type === eventType &&
      event.occurredAt instanceof Date &&
      event.occurredAt.getTime() === occurredAt.getTime(),
  );

  if (!alreadyRecorded) {
    order.timeline.push({
      type: eventType,
      occurredAt,
      description: `Shipment ${shipment.trackingNumber} is ${shipment.status.replace(/_/g, " ")}.`,
      source: "provider",
    });
  }

  await order.save();

  return order;
}

async function recordShipmentActivity(
  shipment: ShipmentDocument,
  actor: Parameters<typeof actorFromUser>[0],
  input: { title: string; description: string; action: string },
) {
  await recordActivity({
    type: "shipment_updated",
    title: input.title,
    description: input.description,
    actor: actorFromUser(actor),
    subject: {
      type: "shipment",
      id: shipment._id,
      label: shipment.trackingNumber,
    },
    href: `/logistics/${String(shipment._id)}`,
    metadata: {
      action: input.action,
      status: shipment.status,
      providerStatus: shipment.providerStatus ?? null,
      provider: shipment.provider ?? "shipbubble",
    },
  });
}

export interface SyncShipmentOptions {
  actor?: Parameters<typeof actorFromUser>[0];
  source?: "manual" | "webhook" | "system";
  payload?: ShipbubbleShipmentPayload;
  fetchImpl?: typeof fetch;
}

export async function syncShipmentFromProvider(
  shipment: ShipmentDocument,
  options: SyncShipmentOptions = {},
) {
  shipment.lastSyncAttemptAt = new Date();
  shipment.syncAttempts = (shipment.syncAttempts ?? 0) + 1;

  try {
    const payload =
      options.payload ??
      (await fetchShipbubbleShipment(shipment, options.fetchImpl));

    if (!payload) {
      shipment.providerError =
        "Shipbubble did not return a shipment for this tracking reference.";
      shipment.lastSyncedAt = new Date();
      await shipment.save();

      throw createError(
        "Shipbubble did not return a shipment for this tracking reference.",
        404,
      );
    }

    const result = applyProviderShipment(shipment, payload, {
      source: options.source === "webhook" ? "webhook" : "provider",
    });

    await shipment.save();

    const order = await syncOrderStatus(shipment);

    if (result.changed) {
      await recordShipmentActivity(shipment, options.actor, {
        title:
          shipment.status === "failed"
            ? "Shipment failed"
            : shipment.status === "delivered"
              ? "Shipment delivered"
              : "Shipment status synced",
        description: `Shipbubble reported ${shipment.providerStatus ?? shipment.status} for ${shipment.trackingNumber}.`,
        action: options.source ?? "sync",
      });
    }

    return { shipment, result, order };
  } catch (error) {
    shipment.providerError =
      error instanceof Error ? error.message : "Shipment sync failed.";
    shipment.lastSyncedAt = new Date();

    try {
      await shipment.save();
    } catch (saveError) {
      console.error("[shipments] failed to persist sync error", saveError);
    }

    throw error;
  }
}

export async function refreshShipment(
  shipmentId: string,
  actor?: Parameters<typeof actorFromUser>[0],
) {
  const shipment = await Shipment.findById(shipmentId);
  if (!shipment) throw createError("Shipment not found", 404);

  return syncShipmentFromProvider(shipment, { actor, source: "manual" });
}

export async function retryShipmentSync(
  shipmentId: string,
  actor?: Parameters<typeof actorFromUser>[0],
) {
  const shipment = await Shipment.findById(shipmentId);
  if (!shipment) throw createError("Shipment not found", 404);

  if (isTerminalShipmentStatus(shipment.status) && !shipment.providerError) {
    throw createError(
      "A delivered or cancelled shipment cannot be retried.",
      400,
    );
  }

  if (shipment.status !== "failed" && !shipment.providerError) {
    throw createError(
      "This shipment is already synchronised. Use refresh to pull the latest provider state.",
      400,
    );
  }

  const result = await syncShipmentFromProvider(shipment, {
    actor,
    source: "manual",
  });

  await recordShipmentActivity(shipment, actor, {
    title: "Shipment retry completed",
    description: `A retry synchronised ${shipment.trackingNumber} with Shipbubble.`,
    action: "retry",
  });

  return result;
}

export async function cancelShipment(
  shipmentId: string,
  input: { reason?: string | null } = {},
  actor?: Parameters<typeof actorFromUser>[0],
) {
  const shipment = await Shipment.findById(shipmentId);
  if (!shipment) throw createError("Shipment not found", 404);

  if (shipment.status === "cancelled") {
    throw createError("Shipment is already cancelled.", 400);
  }

  if (
    ["picked_up", "in_transit", "delivered", "failed"].includes(
      shipment.status,
    )
  ) {
    throw createError(
      "Shipbubble can only cancel a scheduled shipment before it is processed.",
      400,
    );
  }

  if (!shipment.providerOrderId) {
    throw createError(
      "This shipment has no Shipbubble order id, so it cannot be cancelled with the provider.",
      400,
    );
  }

  const provider = (shipment.provider ?? "shipbubble").toLowerCase();
  if (provider !== "shipbubble") {
    throw createError(
      "Cancellation is only supported for Shipbubble shipments.",
      400,
    );
  }

  const response = await cancelShipbubbleShipment(shipment.providerOrderId);

  shipment.status = "cancelled";
  shipment.providerStatus = "cancelled";
  shipment.cancelledAt = new Date();
  shipment.cancelReason = input.reason ?? null;
  shipment.lastSyncedAt = new Date();
  shipment.providerResponse = response;
  shipment.providerError = null;
  shipment.set("events", [
    ...(shipment.events ?? []),
    {
      key: buildShipmentEventKey({
        providerOrderId: shipment.providerOrderId,
        trackingNumber: shipment.trackingNumber,
        status: "cancelled",
        message: input.reason
          ? `Shipment cancelled: ${input.reason}`
          : "Shipment cancelled by an administrator.",
        occurredAt: shipment.cancelledAt,
      }),
      status: "cancelled",
      message: input.reason
        ? `Shipment cancelled: ${input.reason}`
        : "Shipment cancelled by an administrator.",
      occurredAt: shipment.cancelledAt,
      source: "system",
      receivedAt: shipment.cancelledAt,
    },
  ]);
  shipment.lastEventAt = shipment.cancelledAt;

  await shipment.save();

  await recordShipmentActivity(shipment, actor, {
    title: "Shipment cancelled",
    description: `${shipment.trackingNumber} was cancelled with Shipbubble.`,
    action: "cancel",
  });

  return { shipment, response };
}
