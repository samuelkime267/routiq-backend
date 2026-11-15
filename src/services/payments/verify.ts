import CheckoutIntent from "@/models/checkoutIntent.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import { createError } from "@/utils";
import {
  applyPaymentSuccess,
  markCheckoutPaymentFailed,
} from "./apply";
import { verifyPaystackTransaction } from "./paystack";

export interface VerifyCheckoutPaymentInput {
  masterOrderNumber: string;
  customerId: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface VerifyCheckoutPaymentResult {
  masterOrderNumber: string;
  status: "paid" | "pending" | "failed";
  message: string;
  paymentReference: string | null;
  paidAt: string | null;
  orders: Array<{
    _id: string;
    orderNumber: string;
    store: string;
    total: number;
    paymentStatus: string;
    status: string;
  }>;
}

/**
 * Server-to-server verification. The browser only reports that it returned from
 * the checkout page; the amount and status always come from the provider.
 */
export async function verifyCheckoutPayment(
  input: VerifyCheckoutPaymentInput,
): Promise<VerifyCheckoutPaymentResult> {
  const intent = await CheckoutIntent.findOne({
    masterOrderNumber: input.masterOrderNumber,
    customer: input.customerId,
  });

  if (!intent) {
    throw createError("Checkout not found", 404);
  }

  const loadOrders = async () => {
    const orders = await Order.find({ _id: { $in: intent.orders ?? [] } })
      .sort({ createdAt: 1 })
      .lean();

    return orders.map((order) => ({
      _id: String(order._id),
      orderNumber: order.orderNumber,
      store: String(order.store),
      total: order.total,
      paymentStatus: order.paymentStatus,
      status: order.status,
    }));
  };

  if (intent.status === "paid") {
    return {
      masterOrderNumber: intent.masterOrderNumber,
      status: "paid",
      message: "This order group is already paid.",
      paymentReference: intent.providerReference ?? null,
      paidAt: intent.paidAt ? new Date(intent.paidAt).toISOString() : null,
      orders: await loadOrders(),
    };
  }

  if (!intent.providerReference) {
    throw createError(
      "This checkout has no payment attempt to verify. Start the payment again.",
      409,
    );
  }

  const verification = await verifyPaystackTransaction(
    intent.providerReference,
    input.fetchImpl,
  );

  if (verification.status === "success") {
    if (verification.amount !== intent.total) {
      throw createError(
        "The payment amount did not match the checkout total. Contact support before retrying.",
        409,
      );
    }

    await applyPaymentSuccess({
      masterOrderNumber: intent.masterOrderNumber,
      providerReference: intent.providerReference,
      transactionId: verification.transactionId,
      channel: verification.channel,
      paidAt: verification.paidAt ?? input.now ?? new Date(),
      gatewayResponse: verification.gatewayResponse,
      raw: verification.raw,
    });

    return {
      masterOrderNumber: intent.masterOrderNumber,
      status: "paid",
      message: "Payment confirmed.",
      paymentReference: intent.providerReference,
      paidAt: (verification.paidAt ?? new Date()).toISOString(),
      orders: await loadOrders(),
    };
  }

  if (
    verification.status === "failed" ||
    verification.status === "abandoned"
  ) {
    await markCheckoutPaymentFailed(
      intent,
      verification.gatewayResponse ??
        "The payment was not completed. You can try again.",
    );

    return {
      masterOrderNumber: intent.masterOrderNumber,
      status: "failed",
      message:
        verification.gatewayResponse ??
        "The payment was not completed. You can try again.",
      paymentReference: intent.providerReference,
      paidAt: null,
      orders: await loadOrders(),
    };
  }

  const pendingPayments = await Payment.countDocuments({
    _id: { $in: intent.payments ?? [] },
    status: "successful",
  });

  return {
    masterOrderNumber: intent.masterOrderNumber,
    status: pendingPayments > 0 ? "paid" : "pending",
    message:
      pendingPayments > 0
        ? "Payment confirmed."
        : "We have not received confirmation from the payment provider yet.",
    paymentReference: intent.providerReference,
    paidAt: null,
    orders: await loadOrders(),
  };
}
