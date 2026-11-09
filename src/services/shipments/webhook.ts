import mongoose from "mongoose";
import Shipment, { type ShipmentDocument } from "@/models/shipment.model";
import ProviderWebhookEvent from "@/models/providerWebhookEvent.model";
import { createError } from "@/utils";
import { createHash } from "node:crypto";
import { isShipbubbleConfigured, verifyShipbubbleSignature } from "./provider";
import { buildWebhookKey } from "./status";
import { syncShipmentFromProvider } from "./sync";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface WebhookProcessInput {
  rawBody: Buffer | string;
  signature?: string | null;
  payload: unknown;
  now?: Date;
}

export interface WebhookProcessResult {
  received: boolean;
  duplicate: boolean;
  processed: boolean;
  status:
    | "processed"
    | "ignored"
    | "duplicate"
    | "unmatched"
    | "unconfigured";
  eventId?: string | null;
  shipmentId?: string | null;
  message: string;
}

function payloadProviderOrderId(payload: Record<string, unknown>) {
  const candidate =
    payload.order_id ??
    payload.orderId ??
    (isRecord(payload.shipment) ? payload.shipment.order_id : null);

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function payloadEventType(payload: Record<string, unknown>) {
  const candidate = payload.event ?? payload.type ?? payload.event_type;

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : "shipment.status.updated";
}

function hashRaw(rawBody: Buffer | string) {
  return createHash("sha256")
    .update(typeof rawBody === "string" ? rawBody : rawBody)
    .digest("hex");
}

/**
 * Processes a Shipbubble webhook idempotently.
 *
 * The signed raw body is verified first, then a unique ledger row is inserted.
 * A repeated delivery with the same semantic event hits the unique index and is
 * acknowledged without touching the shipment again. If applying the payload
 * fails, the ledger row is removed so the provider's retry can make progress.
 */
export async function processShipbubbleWebhook(
  input: WebhookProcessInput,
): Promise<WebhookProcessResult> {
  if (!isShipbubbleConfigured) {
    throw createError(
      "Shipbubble webhooks are not configured. Set SHIPBUBBLE_API_KEY on the server.",
      503,
    );
  }

  if (!verifyShipbubbleSignature(input.rawBody, input.signature)) {
    throw createError("Invalid Shipbubble webhook signature", 401);
  }

  if (!isRecord(input.payload)) {
    throw createError("Invalid Shipbubble webhook payload", 400);
  }

  const providerPayload = isRecord(input.payload.data)
    ? { ...input.payload.data }
    : input.payload;
  const eventType = payloadEventType(input.payload);
  const providerOrderId = payloadProviderOrderId(providerPayload);
  const key = buildWebhookKey(
    eventType,
    providerOrderId,
    input.rawBody,
    providerPayload,
  );
  const payloadHash = hashRaw(input.rawBody);
  const now = input.now ?? new Date();

  let ledger;

  try {
    ledger = await ProviderWebhookEvent.create({
      provider: "shipbubble",
      key,
      eventType,
      providerOrderId,
      payloadHash,
      status: "processing",
      receivedAt: now,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return {
        received: true,
        duplicate: true,
        processed: false,
        status: "duplicate",
        message: "Duplicate Shipbubble webhook ignored.",
      };
    }

    throw error;
  }

  if (!providerOrderId) {
    ledger.status = "ignored";
    ledger.error = "Webhook payload has no order_id.";
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: false,
      status: "ignored",
      eventId: String(ledger._id),
      message: "Webhook payload has no order_id; nothing to update.",
    };
  }

  const shipment = (await Shipment.findOne({
    providerOrderId,
  })) as ShipmentDocument | null;

  if (!shipment) {
    ledger.status = "ignored";
    ledger.error = `No shipment matches Shipbubble order ${providerOrderId}.`;
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: false,
      status: "unmatched",
      eventId: String(ledger._id),
      message: "Webhook received but no shipment matched the provider order.",
    };
  }

  try {
    await syncShipmentFromProvider(shipment, {
      payload: providerPayload,
      source: "webhook",
    });

    ledger.status = "processed";
    ledger.shipment = shipment._id;
    ledger.processedAt = new Date();
    ledger.error = null;
    await ledger.save();

    shipment.lastWebhookAt = new Date();
    await shipment.save();

    return {
      received: true,
      duplicate: false,
      processed: true,
      status: "processed",
      eventId: String(ledger._id),
      shipmentId: String(shipment._id),
      message: "Shipment updated from Shipbubble webhook.",
    };
  } catch (error) {
    // Remove the ledger row: the provider can retry the same payload and the
    // next attempt is allowed to process it again.
    if (mongoose.connection.readyState === 1) {
      await ProviderWebhookEvent.deleteOne({ _id: ledger._id }).catch(
        (deleteError) => {
          console.error("[shipbubble] failed to release webhook ledger", deleteError);
        },
      );
    }

    throw error;
  }
}
