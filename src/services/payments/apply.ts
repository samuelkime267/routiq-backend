import mongoose from "mongoose";
import CheckoutIntent, {
  type CheckoutIntentDocument,
} from "@/models/checkoutIntent.model";
import Escrow from "@/models/escrow.model";
import Order from "@/models/order.model";
import Payment, { type PaymentChannel } from "@/models/payment.model";
import { recordActivity } from "@/lib/activity";

/**
 * Applies a provider-confirmed payment to every vendor sub-order in a checkout.
 *
 * The function is intentionally idempotent: a replayed webhook or a second
 * verification request can only transition a payment once, and the escrow row
 * is upserted by order id.
 */

export function mapPaymentChannel(channel?: string | null): PaymentChannel {
  const normalised = (channel ?? "").trim().toLowerCase();

  if (normalised === "bank" || normalised === "bank_transfer") {
    return "bank_transfer";
  }
  if (normalised === "ussd") return "ussd";
  if (normalised === "mobile_money" || normalised === "wallet") {
    return "wallet";
  }

  return "card";
}

export interface ApplyPaymentSuccessInput {
  masterOrderNumber: string;
  providerReference?: string | null;
  transactionId?: string | null;
  channel?: string | null;
  paidAt?: Date | null;
  gatewayResponse?: string | null;
  raw?: unknown;
}

export interface ApplyPaymentResult {
  applied: boolean;
  alreadyPaid: boolean;
  masterOrderNumber: string;
  paymentStatus: "paid" | "pending";
  orderNumbers: string[];
}

async function markOrderPaid(
  orderId: unknown,
  payment: { reference: string; channel?: string | null },
  paidAt: Date,
) {
  const order = await Order.findById(orderId);

  if (!order) return null;
  if (order.paymentStatus === "paid") return order;

  order.paymentStatus = "paid";
  if (order.status === "pending") order.status = "confirmed";

  order.timeline = order.timeline ?? [];
  const alreadyRecorded = order.timeline.some(
    (event) => event.type === "payment_confirmed",
  );

  if (!alreadyRecorded) {
    order.timeline.push({
      type: "payment_confirmed",
      occurredAt: paidAt,
      description: `Payment ${payment.reference} confirmed.`,
      source: "system",
    });
  }

  await order.save();

  return order;
}

export async function applyPaymentSuccess(
  input: ApplyPaymentSuccessInput,
): Promise<ApplyPaymentResult> {
  const intent = await CheckoutIntent.findOne({
    masterOrderNumber: input.masterOrderNumber,
  });

  if (!intent) {
    return {
      applied: false,
      alreadyPaid: false,
      masterOrderNumber: input.masterOrderNumber,
      paymentStatus: "pending",
      orderNumbers: [],
    };
  }

  const reference =
    input.providerReference ?? intent.providerReference ?? null;

  const filter: Record<string, unknown> = intent.payments?.length
    ? { _id: { $in: intent.payments } }
    : reference
      ? { providerReference: reference }
      : { _id: { $in: [] } };

  const payments = await Payment.find(filter);
  const paidAt = input.paidAt ?? new Date();
  const channel = mapPaymentChannel(input.channel);
  const orderNumbers: string[] = [];
  let applied = false;

  for (const payment of payments) {
    if (payment.status === "successful") {
      if (payment.order) {
        const order = await Order.findById(payment.order).select("orderNumber");
        if (order) orderNumbers.push(order.orderNumber);
      }
      continue;
    }

    payment.status = "successful";
    payment.paidAt = paidAt;
    payment.channel = channel;
    payment.failureReason = null;
    payment.providerReference = reference ?? payment.providerReference;
    if (input.transactionId) {
      payment.providerTransactionId = input.transactionId;
    }
    if (input.raw !== undefined) {
      payment.providerMetadata = input.raw;
    }

    await payment.save();
    applied = true;

    const order = await markOrderPaid(payment.order, payment, paidAt);
    if (!order) continue;

    orderNumbers.push(order.orderNumber);

    // Escrow holds the vendor's proceeds. The unique order index makes the
    // upsert safe when a webhook and a verification race each other.
    await Escrow.findOneAndUpdate(
      { order: order._id },
      {
        $setOnInsert: {
          payment: payment._id,
          store: payment.store,
          vendor: payment.vendor,
          amountHeld: payment.vendorAmount,
          amountReleased: 0,
          amountRefunded: 0,
          status: "held",
          heldAt: paidAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await recordActivity({
      type: "payment_confirmed",
      title: "Payment confirmed",
      description: `${order.orderNumber} was paid via ${payment.provider ?? "the payment provider"}.`,
      actor: { name: "Payment provider", role: "system" },
      subject: { type: "order", id: order._id, label: order.orderNumber },
      href: `/orders/${order.orderNumber}`,
      metadata: {
        reference: payment.reference,
        providerReference: reference,
        amount: payment.amount,
        channel,
        gatewayResponse: input.gatewayResponse ?? null,
      },
    });
  }

  if (applied || intent.status !== "paid") {
    intent.status = "paid";
    intent.paidAt = paidAt;
    intent.failureReason = null;
    if (reference) intent.providerReference = reference;
    if (input.transactionId) {
      intent.providerTransactionId = input.transactionId;
    }
    await intent.save();
  }

  return {
    applied,
    alreadyPaid: !applied && intent.status === "paid",
    masterOrderNumber: input.masterOrderNumber,
    paymentStatus: "paid",
    orderNumbers,
  };
}

export async function markCheckoutPaymentFailed(
  intent: CheckoutIntentDocument,
  reason: string,
) {
  await Payment.updateMany(
    { _id: { $in: intent.payments ?? [] }, status: { $ne: "successful" } },
    { $set: { status: "failed", failureReason: reason } },
  );

  intent.status = "failed";
  intent.failureReason = reason;
  await intent.save();

  return intent;
}

/**
 * Prepares a failed checkout for another payment attempt. The orders and stock
 * reservation stay in place; only the payment attempt is reset.
 */
export async function resetCheckoutPayment(
  intent: CheckoutIntentDocument,
  providerReference: string,
) {
  await Payment.updateMany(
    { _id: { $in: intent.payments ?? [] }, status: { $ne: "successful" } },
    {
      $set: {
        status: "pending",
        failureReason: null,
        providerReference,
        providerTransactionId: null,
        authorizationUrl: null,
        accessCode: null,
      },
    },
  );

  intent.status = "created";
  intent.providerReference = providerReference;
  intent.providerTransactionId = null;
  intent.authorizationUrl = null;
  intent.accessCode = null;
  intent.failureReason = null;
  await intent.save();

  return intent;
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}
