import CheckoutIntent from "@/models/checkoutIntent.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import { createError } from "@/utils";
import { isPaystackConfigured } from "@/services/payments/paystack";
import { checkoutSummaryFromIntent } from "./place";
import type { CheckoutQuote } from "./quote";

/**
 * Read model for the confirmation screen.
 *
 * The stored snapshot is what the customer agreed to pay. Order and payment
 * states are joined live so a pending payment, a confirmed payment or a failed
 * attempt is reported accurately rather than from a stale client value.
 */
export async function getCheckoutState(
  masterOrderNumber: string,
  customerId: string,
) {
  const intent = await CheckoutIntent.findOne({
    masterOrderNumber,
    customer: customerId,
  });

  if (!intent) {
    throw createError("Checkout not found", 404);
  }

  const snapshot = intent.snapshot as CheckoutQuote | null;
  const orders = await Order.find({ _id: { $in: intent.orders ?? [] } })
    .sort({ createdAt: 1 })
    .lean();
  const payments = await Payment.find({ _id: { $in: intent.payments ?? [] } })
    .sort({ createdAt: 1 })
    .lean();

  const paidPayments = payments.filter(
    (payment) => payment.status === "successful",
  );
  const failedPayments = payments.filter(
    (payment) => payment.status === "failed",
  );

  return {
    masterOrderNumber: intent.masterOrderNumber,
    status: intent.status,
    createdAt: intent.createdAt ?? null,
    paidAt: intent.paidAt ?? null,
    summary: checkoutSummaryFromIntent(intent),
    address: snapshot?.address ?? null,
    groups: (snapshot?.groups ?? []).map((group) => ({
      store: group.store,
      items: group.items,
      subtotal: group.subtotal,
      deliveryFee: group.deliveryFee,
      discount: group.discount,
      total: group.total,
      delivery: group.selectedDelivery,
      estimatedDeliveryAt: group.estimatedDeliveryAt,
    })),
    orders: orders.map((order) => ({
      _id: String(order._id),
      orderNumber: order.orderNumber,
      subOrderNumber: order.subOrderNumber ?? null,
      store: String(order.store),
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      discount: order.discount,
      total: order.total,
      itemCount: (order.items ?? []).reduce(
        (count, item) => count + item.quantity,
        0,
      ),
      expectedDeliveryAt: order.expectedDeliveryAt ?? null,
      placedAt: order.placedAt ?? null,
    })),
    payment: {
      provider: isPaystackConfigured ? intent.provider ?? "paystack" : null,
      reference: intent.providerReference ?? null,
      initialized: Boolean(intent.authorizationUrl) || intent.status === "paid",
      status:
        intent.status === "paid" || paidPayments.length > 0
          ? ("paid" as const)
          : intent.status === "failed" || failedPayments.length > 0
            ? ("failed" as const)
            : ("pending" as const),
      failureReason: intent.failureReason ?? null,
      canRetry:
        intent.status !== "paid" && (intent.orders ?? []).length > 0,
    },
  };
}
