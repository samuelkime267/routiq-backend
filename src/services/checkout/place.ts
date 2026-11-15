import Address from "@/models/address.model";
import CheckoutIntent, {
  type CheckoutIntentDocument,
} from "@/models/checkoutIntent.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Product from "@/models/product.model";
import User, { type UserDocument } from "@/models/user.model";
import { recordActivity } from "@/lib/activity";
import { notifyVendor } from "@/services/notifications/notify";
import { platformFeeFor, vendorAmountFor } from "@/config/marketplace";
import { MARKETPLACE_URL } from "@/config/env";
import { createError } from "@/utils";
import {
  applyPaymentSuccess,
  resetCheckoutPayment,
} from "@/services/payments/apply";
import {
  initializePaystackTransaction,
  isPaystackConfigured,
} from "@/services/payments/paystack";
import {
  buildCheckoutQuote,
  checkoutFingerprint,
  isBlockingIssue,
  type CheckoutItemInput,
  type CheckoutQuote,
  type CheckoutSummary,
} from "./quote";
import {
  generateOrderNumbers,
  generatePaymentReferences,
  generateProviderReference,
} from "./numbers";

export interface CheckoutPaymentResult {
  provider: "paystack" | null;
  initialized: boolean;
  reference: string | null;
  authorizationUrl: string | null;
  accessCode: string | null;
  status: "pending" | "paid" | "failed";
  message: string | null;
}

export type PlaceCheckoutOutcome =
  | { kind: "blocked"; message: string; quote: CheckoutQuote }
  | { kind: "price_changed"; message: string; quote: CheckoutQuote }
  | { kind: "payment_unavailable"; message: string }
  | {
      kind: "placed";
      resumed: boolean;
      masterOrderNumber: string;
      orders: unknown[];
      summary: CheckoutSummary;
      payment: CheckoutPaymentResult;
    };

export interface PlaceCheckoutInput {
  customer: UserDocument;
  key: string;
  items: CheckoutItemInput[];
  addressId: string;
  deliverySelections?: Record<string, string>;
  expectedTotal?: number | null;
}

function paymentFromIntent(
  intent: CheckoutIntentDocument,
  providerName: "paystack" | null,
): CheckoutPaymentResult {
  if (intent.status === "paid") {
    return {
      provider: providerName,
      initialized: true,
      reference: intent.providerReference ?? null,
      authorizationUrl: null,
      accessCode: null,
      status: "paid",
      message: null,
    };
  }

  if (intent.status === "initialized" && intent.authorizationUrl) {
    return {
      provider: providerName,
      initialized: true,
      reference: intent.providerReference ?? null,
      authorizationUrl: intent.authorizationUrl,
      accessCode: intent.accessCode ?? null,
      status: "pending",
      message: null,
    };
  }

  return {
    provider: providerName,
    initialized: false,
    reference: intent.providerReference ?? null,
    authorizationUrl: null,
    accessCode: null,
    status: intent.status === "failed" ? "failed" : "pending",
    message: intent.failureReason ?? null,
  };
}

async function setIntentPaymentState(
  intent: CheckoutIntentDocument,
  providerReference: string,
  authorizationUrl: string | null,
  accessCode: string | null,
) {
  await Payment.updateMany(
    { _id: { $in: intent.payments ?? [] } },
    {
      $set: {
        providerReference,
        authorizationUrl,
        accessCode,
      },
    },
  );

  intent.providerReference = providerReference;
  intent.authorizationUrl = authorizationUrl;
  intent.accessCode = accessCode;
  intent.status = authorizationUrl ? "initialized" : "created";
  intent.failureReason = null;
  await intent.save();
}

async function initializeIntentPayment(
  intent: CheckoutIntentDocument,
  customer: UserDocument,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<CheckoutPaymentResult> {
  if (intent.total <= 0) {
    const reference = intent.providerReference ?? generateProviderReference();
    await setIntentPaymentState(intent, reference, null, null);
    await applyPaymentSuccess({
      masterOrderNumber: intent.masterOrderNumber,
      providerReference: reference,
      channel: "wallet",
      paidAt: options.now ?? new Date(),
      gatewayResponse: "Zero-value checkout",
    });

    return {
      provider: null,
      initialized: true,
      reference,
      authorizationUrl: null,
      accessCode: null,
      status: "paid",
      message: "This order did not require a payment.",
    };
  }

  const reference = generateProviderReference();
  await resetCheckoutPayment(intent, reference);

  try {
    const initialized = await initializePaystackTransaction(
      {
        email: customer.email,
        amount: intent.total,
        reference,
        callbackUrl: `${MARKETPLACE_URL}/checkout/confirmation/${encodeURIComponent(intent.masterOrderNumber)}`,
        metadata: {
          masterOrderNumber: intent.masterOrderNumber,
          customerId: String(customer._id),
          orders: (intent.orders ?? []).map(String),
        },
        channels: ["card", "bank_transfer", "ussd"],
      },
      options.fetchImpl,
    );

    await setIntentPaymentState(
      intent,
      initialized.reference,
      initialized.authorizationUrl,
      initialized.accessCode,
    );

    return {
      provider: "paystack",
      initialized: true,
      reference: initialized.reference,
      authorizationUrl: initialized.authorizationUrl,
      accessCode: initialized.accessCode,
      status: "pending",
      message: null,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Payment could not be started. Please try again.";

    intent.status = "failed";
    intent.failureReason = message;
    await intent.save();

    return {
      provider: "paystack",
      initialized: false,
      reference,
      authorizationUrl: null,
      accessCode: null,
      status: "failed",
      message,
    };
  }
}

function snapshotFromQuote(quote: CheckoutQuote) {
  return {
    groups: quote.groups,
    summary: quote.summary,
    address: quote.address,
  };
}

export function checkoutSummaryFromIntent(
  intent: CheckoutIntentDocument,
): CheckoutSummary {
  return (
    (intent.snapshot as { summary?: CheckoutSummary } | null)?.summary ?? {
      currency: "NGN",
      itemCount: 0,
      subtotal: intent.subtotal,
      deliveryFee: intent.deliveryFee,
      serviceFee: intent.serviceFee,
      discount: intent.discount,
      total: intent.total,
    }
  );
}

async function resumeIntent(
  intent: CheckoutIntentDocument,
  customer: UserDocument,
  options: { fetchImpl?: typeof fetch; now?: Date },
): Promise<PlaceCheckoutOutcome> {
  if (intent.status === "creating" && !intent.orders?.length) {
    const ageMs =
      Date.now() -
      new Date(
        (intent as unknown as { createdAt?: Date }).createdAt ?? 0,
      ).getTime();

    if (ageMs < 60_000) {
      return {
        kind: "blocked",
        message:
          "This checkout is still being processed. Wait a moment, then check your orders before trying again.",
        quote: intent.snapshot as CheckoutQuote,
      };
    }

    // An abandoned `creating` record cannot be resumed safely; remove it so a
    // fresh attempt can allocate new order numbers.
    await CheckoutIntent.deleteOne({ _id: intent._id });
    return { kind: "blocked", message: "Please try placing the order again.", quote: intent.snapshot as CheckoutQuote };
  }

  const orders = await Order.find({ _id: { $in: intent.orders ?? [] } })
    .sort({ createdAt: 1 })
    .lean();

  const summary = checkoutSummaryFromIntent(intent);

  let payment = paymentFromIntent(intent, isPaystackConfigured ? "paystack" : null);

  // A previous attempt failed to start the payment: retry with a fresh
  // provider reference without touching the orders or the stock reservation.
  if (
    intent.status !== "paid" &&
    (!payment.initialized || intent.status === "failed")
  ) {
    payment = await initializeIntentPayment(intent, customer, options);
  }

  return {
    kind: "placed",
    resumed: true,
    masterOrderNumber: intent.masterOrderNumber,
    orders,
    summary,
    payment,
  };
}

async function rollback(
  decimals: Array<{ product: string; quantity: number }>,
  orderIds: unknown[],
  paymentIds: unknown[],
  intentId: unknown,
) {
  await Promise.allSettled(
    decimals.map((line) =>
      Product.updateOne(
        { _id: line.product },
        { $inc: { stock: line.quantity } },
      ),
    ),
  );

  await Promise.allSettled([
    orderIds.length ? Order.deleteMany({ _id: { $in: orderIds } }) : null,
    paymentIds.length ? Payment.deleteMany({ _id: { $in: paymentIds } }) : null,
    intentId ? CheckoutIntent.deleteOne({ _id: intentId }) : null,
  ]);
}

export async function placeCheckout(
  input: PlaceCheckoutInput,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<PlaceCheckoutOutcome> {
  const { customer } = input;
  const now = options.now ?? new Date();
  const deliverySelections = input.deliverySelections ?? {};
  const fingerprint = checkoutFingerprint(
    input.items,
    input.addressId,
    deliverySelections,
  );

  const existing = await CheckoutIntent.findOne({
    customer: customer._id,
    key: input.key,
  });

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return {
        kind: "price_changed",
        message:
          "This checkout attempt was already used with a different cart. Start a new checkout to change your items.",
        quote: existing.snapshot as CheckoutQuote,
      };
    }

    return resumeIntent(existing, customer, options);
  }

  if (!isPaystackConfigured) {
    return {
      kind: "payment_unavailable",
      message:
        "Online payment is not configured yet, so orders cannot be placed. Please try again later.",
    };
  }

  const quote = await buildCheckoutQuote(
    {
      customerId: String(customer._id),
      items: input.items,
      addressId: input.addressId,
      deliverySelections,
    },
    { fetchImpl: options.fetchImpl, now },
  );

  if (!quote.groups.length || quote.blocking || !quote.deliveryAvailable) {
    return {
      kind: "blocked",
      message:
        quote.issues.find(isBlockingIssue)?.message ??
        "This cart cannot be checked out right now. Review the items and delivery address.",
      quote,
    };
  }

  if (
    typeof input.expectedTotal === "number" &&
    Math.round(input.expectedTotal) !== quote.summary.total
  ) {
    return {
      kind: "price_changed",
      message:
        "The order total changed while you were checking out. Review the updated total and confirm again.",
      quote,
    };
  }

  const numbers = await generateOrderNumbers(quote.groups.length);
  const paymentReferences = await generatePaymentReferences(quote.groups.length);
  const providerReference = generateProviderReference();

  let intent: CheckoutIntentDocument;

  try {
    intent = await CheckoutIntent.create({
      customer: customer._id,
      key: input.key,
      status: "creating",
      fingerprint,
      masterOrderNumber: numbers.masterOrderNumber,
      orders: [],
      payments: [],
      subtotal: quote.summary.subtotal,
      deliveryFee: quote.summary.deliveryFee,
      serviceFee: quote.summary.serviceFee,
      discount: quote.summary.discount,
      total: quote.summary.total,
      snapshot: snapshotFromQuote(quote),
      provider: "paystack",
      providerReference,
    });
  } catch (error) {
    // A concurrent request won the unique (customer, key) race.
    const raced = await CheckoutIntent.findOne({
      customer: customer._id,
      key: input.key,
    });

    if (raced && raced.fingerprint === fingerprint) {
      return resumeIntent(raced, customer, options);
    }

    throw error;
  }

  const decremented: Array<{ product: string; quantity: number }> = [];
  const createdOrders: Array<{ _id: unknown }> = [];
  const createdPayments: Array<{ _id: unknown }> = [];

  try {
    // Revalidate stock atomically. A product that sold out after the quote is
    // restored to its previous quantity before the request returns.
    for (const group of quote.groups) {
      for (const line of group.items) {
        const updated = await Product.updateOne(
          {
            _id: line.product,
            stock: { $gte: line.quantity },
            status: "approved",
            publicationStatus: "published",
          },
          { $inc: { stock: -line.quantity } },
        );

        if (updated.modifiedCount !== 1) {
          await rollback(decremented, [], [], intent._id);

          const failedQuote = {
            ...quote,
            issues: [
              ...quote.issues,
              {
                code: "insufficient_stock" as const,
                message: `${line.name} is no longer available in the requested quantity.`,
                productId: line.product,
                productName: line.name,
              },
            ],
            blocking: true,
          };

          return {
            kind: "blocked",
            message: `${line.name} is no longer available in the requested quantity. Update your cart and try again.`,
            quote: failedQuote,
          };
        }

        decremented.push({ product: line.product, quantity: line.quantity });
      }
    }

    const address = quote.address;
    const shippingAddress = address
      ? {
          recipientName: address.recipientName,
          phone: address.phone,
          street: address.street,
          city: address.city,
          lga: address.lga,
          state: address.state,
          country: address.country,
          landmark: address.landmark,
        }
      : null;

    const orderRows = await Order.create(
      quote.groups.map((group, index) => ({
        orderNumber: numbers.orders[index].orderNumber,
        masterOrderNumber: numbers.masterOrderNumber,
        subOrderNumber: numbers.orders[index].subOrderNumber,
        customer: customer._id,
        store: group.store._id,
        vendor: group.vendor,
        items: group.items.map((line) => ({
          product: line.product,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.lineTotal,
        })),
        subtotal: group.subtotal,
        shippingFee: group.deliveryFee,
        discount: group.discount,
        total: group.total,
        status: "pending",
        paymentStatus: "pending",
        shippingCity: address?.city ?? null,
        shippingState: address?.state ?? null,
        shippingAddress,
        placedAt: now,
        expectedDeliveryAt: group.estimatedDeliveryAt
          ? new Date(group.estimatedDeliveryAt)
          : null,
        timeline: [
          {
            type: "created",
            occurredAt: now,
            description: "Order placed at checkout and awaiting payment.",
            source: "system",
          },
        ],
      })),
    );

    createdOrders.push(...orderRows);

    const paymentRows = await Payment.create(
      orderRows.map((order, index) => ({
        reference: paymentReferences[index],
        order: order._id,
        customer: customer._id,
        store: order.store,
        vendor: order.vendor,
        amount: order.total,
        platformFee: platformFeeFor(order.total),
        vendorAmount: vendorAmountFor(order.total),
        currency: "NGN",
        status: "pending",
        channel: "card",
        provider: "paystack",
        providerReference,
      })),
    );

    createdPayments.push(...paymentRows);

    intent.orders = orderRows.map((order) => order._id);
    intent.payments = paymentRows.map((payment) => payment._id);
    intent.status = "created";
    await intent.save();

    await Address.updateOne(
      { _id: input.addressId, customer: customer._id },
      { $set: { lastUsedAt: now } },
    );

    // Order activity and vendor notifications are side effects: they must not
    // roll back a successfully placed order.
    await Promise.allSettled(
      orderRows.map(async (order, index) => {
        await recordActivity({
          type: "order_created",
          channel: "marketplace",
          title: "Order placed",
          description: `${order.orderNumber} was placed by ${customer.name}.`,
          actor: { id: customer._id, name: customer.name, role: "user" },
          subject: { type: "order", id: order._id, label: order.orderNumber },
          href: `/orders/${order.orderNumber}`,
          metadata: {
            masterOrderNumber: numbers.masterOrderNumber,
            total: order.total,
            store: String(order.store),
          },
        });

        await notifyVendor({
          recipient: order.vendor,
          type: "order_created",
          title: "New order received",
          message: `${customer.name} placed ${order.orderNumber} (${quote.groups[index]?.items.length ?? 0} item lines). Payment is pending.`,
          href: `/orders/${order.orderNumber}`,
          metadata: {
            masterOrderNumber: numbers.masterOrderNumber,
            orderNumber: order.orderNumber,
            total: order.total,
          },
        });
      }),
    );

    const payment = await initializeIntentPayment(intent, customer, options);
    const orders = await Order.find({ _id: { $in: intent.orders } })
      .sort({ createdAt: 1 })
      .lean();

    return {
      kind: "placed",
      resumed: false,
      masterOrderNumber: intent.masterOrderNumber,
      orders,
      summary: quote.summary,
      payment,
    };
  } catch (error) {
    await rollback(
      decremented,
      createdOrders.map((order) => order._id),
      createdPayments.map((payment) => payment._id),
      intent._id,
    );

    throw error;
  }
}

/**
 * Starts a fresh payment attempt for an existing checkout. Used by the
 * confirmation screen when a previous attempt failed or was abandoned.
 */
export async function retryCheckoutPayment(
  masterOrderNumber: string,
  customerId: string,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<PlaceCheckoutOutcome> {
  const intent = await CheckoutIntent.findOne({
    masterOrderNumber,
    customer: customerId,
  });

  if (!intent) {
    throw createError("Checkout not found", 404);
  }

  if (!intent.orders?.length) {
    throw createError("This checkout has no orders to pay for.", 400);
  }

  const customer = await User.findById(customerId);

  if (!customer) {
    throw createError("Customer not found", 404);
  }

  if (intent.status === "paid") {
    return resumeIntent(intent, customer, options);
  }

  const payment = await initializeIntentPayment(intent, customer, options);
  const orders = await Order.find({ _id: { $in: intent.orders } })
    .sort({ createdAt: 1 })
    .lean();

  return {
    kind: "placed",
    resumed: true,
    masterOrderNumber: intent.masterOrderNumber,
    orders,
    summary: checkoutSummaryFromIntent(intent),
    payment,
  };
}
