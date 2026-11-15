import { createHash } from "node:crypto";
import CheckoutIntent from "@/models/checkoutIntent.model";
import ProviderWebhookEvent from "@/models/providerWebhookEvent.model";
import { createError } from "@/utils";
import {
  isPaystackConfigured,
  verifyPaystackSignature,
} from "./paystack";
import {
  applyPaymentSuccess,
  markCheckoutPaymentFailed,
} from "./apply";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export interface PaymentWebhookInput {
  rawBody: Buffer | string;
  signature?: string | null;
  payload: unknown;
  now?: Date;
}

export interface PaymentWebhookResult {
  received: boolean;
  duplicate: boolean;
  processed: boolean;
  status: "processed" | "ignored" | "duplicate" | "unconfigured";
  message: string;
}

/**
 * Paystack webhook receiver.
 *
 * Signature verification uses the exact request bytes. The shared provider
 * webhook ledger gives replay protection, and the money transition itself is
 * applied by `applyPaymentSuccess`, which is idempotent and only trusts a
 * provider-originated result.
 */
export async function processPaystackWebhook(
  input: PaymentWebhookInput,
): Promise<PaymentWebhookResult> {
  if (!isPaystackConfigured) {
    throw createError(
      "Paystack webhooks are not configured. Set PAYSTACK_SECRET_KEY on the server.",
      503,
    );
  }

  if (!verifyPaystackSignature(input.rawBody, input.signature)) {
    throw createError("Invalid Paystack webhook signature", 401);
  }

  if (!isRecord(input.payload)) {
    throw createError("Invalid Paystack webhook payload", 400);
  }

  const event = typeof input.payload.event === "string"
    ? input.payload.event
    : "unknown";
  const data = isRecord(input.payload.data) ? input.payload.data : null;

  if (!data) {
    throw createError("Paystack webhook has no data payload", 400);
  }

  const reference =
    typeof data.reference === "string" ? data.reference.trim() : "";
  const status = typeof data.status === "string" ? data.status : "";

  const now = input.now ?? new Date();
  const key = hash(
    `${event}:${reference}:${String(data.id ?? "")}:${status}`,
  );
  const rawBodyHash = hash(
    typeof input.rawBody === "string"
      ? input.rawBody
      : input.rawBody.toString("utf8"),
  );

  let ledger;

  try {
    ledger = await ProviderWebhookEvent.create({
      provider: "paystack",
      key,
      eventType: event,
      providerOrderId: reference || null,
      payloadHash: rawBodyHash,
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
        message: "Duplicate Paystack webhook ignored.",
      };
    }

    throw error;
  }

  if (!reference) {
    ledger.status = "ignored";
    ledger.error = "Webhook payload has no transaction reference.";
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: false,
      status: "ignored",
      message: "Webhook payload has no transaction reference.",
    };
  }

  const intent = await CheckoutIntent.findOne({
    providerReference: reference,
  });

  if (!intent) {
    ledger.status = "ignored";
    ledger.error = `No checkout matches payment reference ${reference}.`;
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: false,
      status: "ignored",
      message: "Webhook does not match a Routiq checkout.",
    };
  }

  const amount = Math.round(Number(data.amount ?? 0) / 100);
  const successful = event === "charge.success" && status === "success";

  if (successful && amount !== intent.total) {
    ledger.status = "ignored";
    ledger.error = `Amount mismatch: expected ${intent.total}, received ${amount}.`;
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: false,
      status: "ignored",
      message: "Payment amount did not match the checkout total.",
    };
  }

  if (successful) {
    const paidAt = data.paid_at ? new Date(String(data.paid_at)) : now;

    await applyPaymentSuccess({
      masterOrderNumber: intent.masterOrderNumber,
      providerReference: reference,
      transactionId:
        data.id === undefined || data.id === null ? null : String(data.id),
      channel: typeof data.channel === "string" ? data.channel : null,
      paidAt: Number.isNaN(paidAt.getTime()) ? now : paidAt,
      gatewayResponse:
        typeof data.gateway_response === "string"
          ? data.gateway_response
          : null,
      raw: data,
    });

    ledger.status = "processed";
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: true,
      status: "processed",
      message: "Payment confirmed and applied to the order group.",
    };
  }

  if (event === "charge.failed" || status === "failed") {
    await markCheckoutPaymentFailed(
      intent,
      typeof data.gateway_response === "string"
        ? data.gateway_response
        : "The payment was declined.",
    );

    ledger.status = "processed";
    ledger.processedAt = new Date();
    await ledger.save();

    return {
      received: true,
      duplicate: false,
      processed: true,
      status: "processed",
      message: "Failed payment recorded.",
    };
  }

  ledger.status = "ignored";
  ledger.error = `Unhandled Paystack event ${event} (${status}).`;
  ledger.processedAt = new Date();
  await ledger.save();

  return {
    received: true,
    duplicate: false,
    processed: false,
    status: "ignored",
    message: "Webhook acknowledged without changing the checkout.",
  };
}
