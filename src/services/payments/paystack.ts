import crypto from "node:crypto";
import {
  PAYSTACK_BASE_URL,
  PAYSTACK_PUBLIC_KEY,
  PAYSTACK_SECRET_KEY,
  PAYSTACK_WEBHOOK_SECRET,
} from "@/config/env";
import { createError } from "@/utils";

type FetchLike = typeof fetch;

export const isPaystackConfigured = Boolean(PAYSTACK_SECRET_KEY);

/**
 * Channels Paystack's hosted checkout can present. They are returned to the
 * frontend so the payment section is driven by server configuration rather
 * than a hard-coded list in the UI.
 */
export const PAYSTACK_CHANNELS = [
  { id: "card", label: "Debit or credit card" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "ussd", label: "USSD" },
] as const;

export type PaystackChannel = (typeof PAYSTACK_CHANNELS)[number]["id"];

export interface PaystackInitializeInput {
  email: string;
  /** Whole Naira. Converted to kobo before it is sent to Paystack. */
  amount: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
}

export interface PaystackInitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export type PaystackVerificationStatus =
  | "success"
  | "failed"
  | "abandoned"
  | "pending";

export interface PaystackVerificationResult {
  status: PaystackVerificationStatus;
  reference: string;
  /** Whole Naira. */
  amount: number;
  channel: string | null;
  currency: string | null;
  transactionId: string | null;
  paidAt: Date | null;
  gatewayResponse: string | null;
  raw: Record<string, unknown>;
}

interface PaystackEnvelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

async function paystackRequest<T>(
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<PaystackEnvelope<T>> {
  if (!isPaystackConfigured) {
    throw createError(
      "Online payment is not configured. Set PAYSTACK_SECRET_KEY on the server before accepting payments.",
      503,
    );
  }

  let response: Response;

  try {
    response = await fetchImpl(`${PAYSTACK_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("[paystack] request failed", {
      path,
      message: error instanceof Error ? error.message : String(error),
    });

    throw createError(
      "The payment provider could not be reached. Please try again shortly.",
      502,
    );
  }

  const text = await response.text();
  let body: PaystackEnvelope<T> | null = null;

  if (text) {
    try {
      body = JSON.parse(text) as PaystackEnvelope<T>;
    } catch {
      body = null;
    }
  }

  if (!response.ok || body?.status === false) {
    const message =
      body?.message ||
      (Array.isArray(body?.errors) ? JSON.stringify(body?.errors) : null) ||
      `Paystack returned HTTP ${response.status}`;

    throw createError(
      `Payment initialisation failed: ${message}`,
      response.status >= 400 && response.status < 500 ? 400 : 502,
    );
  }

  return body ?? { status: true };
}

interface PaystackInitializePayload {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
}

export async function initializePaystackTransaction(
  input: PaystackInitializeInput,
  fetchImpl: FetchLike = fetch,
): Promise<PaystackInitializeResult> {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw createError("Enter a valid payment amount.", 400);
  }

  const body = await paystackRequest<PaystackInitializePayload>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: Math.round(input.amount * 100),
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata ?? {},
        ...(input.channels?.length ? { channels: input.channels } : {}),
      }),
    },
    fetchImpl,
  );

  const data = body.data;

  if (!data?.authorization_url || !data.access_code) {
    throw createError(
      "The payment provider did not return a checkout link. Please try again.",
      502,
    );
  }

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference ?? input.reference,
  };
}

interface PaystackVerificationPayload {
  id?: number | string;
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  paid_at?: string | null;
  gateway_response?: string | null;
  [key: string]: unknown;
}

export function mapPaystackStatus(
  value?: string | null,
): PaystackVerificationStatus {
  const normalised = (value ?? "").trim().toLowerCase();

  if (normalised === "success") return "success";
  if (normalised === "failed") return "failed";
  if (normalised === "abandoned") return "abandoned";
  if (normalised === "reversed") return "failed";

  // ongoing, pending, processing, queued and anything undocumented remain
  // pending: the transaction has not settled in the customer's favour yet.
  return "pending";
}

export async function verifyPaystackTransaction(
  reference: string,
  fetchImpl: FetchLike = fetch,
): Promise<PaystackVerificationResult> {
  const body = await paystackRequest<PaystackVerificationPayload>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
    fetchImpl,
  );

  const data = body.data;

  if (!data?.reference) {
    throw createError(
      "The payment provider could not confirm this transaction.",
      502,
    );
  }

  const paidAt = data.paid_at ? new Date(data.paid_at) : null;

  return {
    status: mapPaystackStatus(data.status),
    reference: data.reference,
    amount: Math.round(Number(data.amount ?? 0) / 100),
    channel: data.channel ?? null,
    currency: data.currency ?? null,
    transactionId:
      data.id === undefined || data.id === null ? null : String(data.id),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
    gatewayResponse: data.gateway_response ?? null,
    raw: data,
  };
}

/**
 * Paystack signs the exact webhook bytes with HMAC-SHA512 using the secret key.
 */
export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature: string | undefined | null,
  secret: string = PAYSTACK_WEBHOOK_SECRET,
) {
  if (!secret || !signature) return false;

  const provided = signature.trim();
  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export function paymentProviderStatus() {
  return {
    provider: isPaystackConfigured ? ("paystack" as const) : null,
    configured: isPaystackConfigured,
    publicKey: isPaystackConfigured ? PAYSTACK_PUBLIC_KEY || null : null,
    channels: isPaystackConfigured
      ? PAYSTACK_CHANNELS.map((channel) => ({ ...channel }))
      : [],
  };
}
