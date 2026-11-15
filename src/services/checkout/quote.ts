import Address, {
  type AddressDocument,
} from "@/models/address.model";
import Product from "@/models/product.model";
import Store from "@/models/store.model";
import {
  PUBLIC_PRODUCT_PUBLICATION_STATUS,
  PUBLIC_PRODUCT_STATUS,
  resolvePublicScope,
} from "@/services/marketplace/visibility";
import {
  estimatedDeliveryAt,
  quoteStoreDelivery,
  selectDeliveryOption,
  type DeliveryAddressInput,
  type DeliveryOption,
  type StoreDeliveryQuote,
} from "@/services/delivery";
import {
  safePlatformSettings,
  type PlatformSettingsView,
} from "@/services/settings";

/**
 * Backend-owned checkout pricing.
 *
 * The customer's device only sends product ids and quantities. Prices, stock,
 * store eligibility, delivery options and totals are resolved here, reusing the
 * same public-visibility rules as the catalogue and the same Shipbubble client
 * as fulfilment.
 */

export const CHECKOUT_ISSUE_CODES = [
  "empty_cart",
  "product_unavailable",
  "store_unavailable",
  "insufficient_stock",
  "price_changed",
  "address_invalid",
  "delivery_unavailable",
] as const;
export type CheckoutIssueCode = (typeof CHECKOUT_ISSUE_CODES)[number];

export interface CheckoutIssue {
  code: CheckoutIssueCode;
  message: string;
  productId?: string;
  productName?: string;
  storeId?: string;
  availableStock?: number;
  expectedUnitPrice?: number;
  currentUnitPrice?: number;
}

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
  expectedUnitPrice?: number | null;
}

export interface CheckoutAddressSnapshot {
  _id: string;
  label: string;
  recipientName: string;
  phone: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  country: string;
  landmark: string | null;
  postalCode: string | null;
}

export interface CheckoutLine {
  product: string;
  name: string;
  image: string | null;
  category: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  lineTotal: number;
  expectedUnitPrice: number | null;
  priceChanged: boolean;
}

export interface CheckoutGroup {
  store: {
    _id: string;
    name: string;
    slug: string;
    logo: string | null;
    city: string | null;
    state: string | null;
  };
  vendor: string;
  items: CheckoutLine[];
  subtotal: number;
  delivery: StoreDeliveryQuote;
  selectedDelivery: DeliveryOption | null;
  deliveryFee: number;
  discount: number;
  total: number;
  estimatedDeliveryAt: string | null;
}

export interface CheckoutSummary {
  currency: "NGN";
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  total: number;
}

export interface CheckoutQuote {
  groups: CheckoutGroup[];
  summary: CheckoutSummary;
  issues: CheckoutIssue[];
  address: CheckoutAddressSnapshot | null;
  deliveryAvailable: boolean;
  blocking: boolean;
  /** Stable descriptor used for checkout idempotency fingerprints. */
  fingerprint: string;
}

export interface CheckoutQuoteInput {
  customerId: string;
  items: CheckoutItemInput[];
  addressId?: string | null;
  deliverySelections?: Record<string, string>;
}

export function addressSnapshot(address: AddressDocument): CheckoutAddressSnapshot {
  return {
    _id: String(address._id),
    label: address.label ?? "Home",
    recipientName: address.recipientName,
    phone: address.phone,
    street: address.street,
    city: address.city,
    lga: address.lga,
    state: address.state,
    country: address.country ?? "Nigeria",
    landmark: address.landmark ?? null,
    postalCode: address.postalCode ?? null,
  };
}

export function deliveryAddressFromSnapshot(
  address: CheckoutAddressSnapshot,
): DeliveryAddressInput {
  return {
    recipientName: address.recipientName,
    phone: address.phone,
    street: address.street,
    city: address.city,
    lga: address.lga,
    state: address.state,
    country: address.country,
  };
}

/** Normalises duplicate product rows and keeps the customer's order. */
export function normaliseItems(items: CheckoutItemInput[]) {
  const merged = new Map<string, CheckoutItemInput>();

  for (const item of items) {
    const existing = merged.get(item.productId);

    if (!existing) {
      merged.set(item.productId, { ...item });
      continue;
    }

    merged.set(item.productId, {
      ...existing,
      quantity: existing.quantity + item.quantity,
      expectedUnitPrice:
        existing.expectedUnitPrice ?? item.expectedUnitPrice ?? null,
    });
  }

  return [...merged.values()];
}

export function checkoutFingerprint(
  items: CheckoutItemInput[],
  addressId?: string | null,
  deliverySelections: Record<string, string> = {},
) {
  const rows = normaliseItems(items)
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort();
  const selections = Object.entries(deliverySelections)
    .map(([store, option]) => `${store}:${option}`)
    .sort();

  return `${addressId ?? "no-address"}|${rows.join(",")}|${selections.join(",")}`;
}

const blockingCodes = new Set<CheckoutIssueCode>(
  CHECKOUT_ISSUE_CODES.filter((code) => code !== "price_changed"),
);

export function isBlockingIssue(issue: CheckoutIssue) {
  return blockingCodes.has(issue.code);
}

const productImage = (images?: string[] | null) =>
  (images ?? []).find((image) => Boolean(image)) ?? null;

export async function buildCheckoutQuote(
  input: CheckoutQuoteInput,
  options: {
    settings?: PlatformSettingsView;
    fetchImpl?: typeof fetch;
    now?: Date;
  } = {},
): Promise<CheckoutQuote> {
  const now = options.now ?? new Date();
  const issues: CheckoutIssue[] = [];
  const items = normaliseItems(input.items);

  if (!items.length) {
    issues.push({
      code: "empty_cart",
      message: "Your cart is empty. Add a product before checking out.",
    });

    return {
      groups: [],
      summary: {
        currency: "NGN",
        itemCount: 0,
        subtotal: 0,
        deliveryFee: 0,
        serviceFee: 0,
        discount: 0,
        total: 0,
      },
      issues,
      address: null,
      deliveryAvailable: false,
      blocking: true,
      fingerprint: checkoutFingerprint(items, input.addressId, input.deliverySelections),
    };
  }

  const [products, scope, settings] = await Promise.all([
    Product.find({ _id: { $in: items.map((item) => item.productId) } }),
    resolvePublicScope(),
    options.settings ? Promise.resolve(options.settings) : safePlatformSettings(),
  ]);

  const publicVendors = new Set(scope.vendorIds.map(String));
  const publicStores = new Set(scope.storeIds.map(String));
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const validLines: Array<{
    product: (typeof products)[number];
    quantity: number;
    expectedUnitPrice: number | null;
  }> = [];

  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product) {
      issues.push({
        code: "product_unavailable",
        message:
          "A product in your cart is no longer available. Remove it to continue.",
        productId: item.productId,
      });
      continue;
    }

    if (
      product.status !== PUBLIC_PRODUCT_STATUS ||
      product.publicationStatus !== PUBLIC_PRODUCT_PUBLICATION_STATUS
    ) {
      issues.push({
        code: "product_unavailable",
        message: `${product.name} is no longer available. Remove it to continue.`,
        productId: String(product._id),
        productName: product.name,
      });
      continue;
    }

    if (
      !publicStores.has(String(product.store)) ||
      !publicVendors.has(String(product.vendor))
    ) {
      issues.push({
        code: "store_unavailable",
        message: `${product.name} is sold by a store that is not currently accepting orders.`,
        productId: String(product._id),
        productName: product.name,
        storeId: String(product.store),
      });
      continue;
    }

    if (product.stock < item.quantity) {
      issues.push({
        code: "insufficient_stock",
        message:
          product.stock > 0
            ? `Only ${product.stock} left of ${product.name}. Update the quantity to continue.`
            : `${product.name} is out of stock. Remove it to continue.`,
        productId: String(product._id),
        productName: product.name,
        availableStock: product.stock,
      });
      continue;
    }

    const expected =
      typeof item.expectedUnitPrice === "number"
        ? Math.round(item.expectedUnitPrice)
        : null;

    if (expected !== null && expected !== product.price) {
      issues.push({
        code: "price_changed",
        message: `The price of ${product.name} changed from ₦${expected.toLocaleString("en-NG")} to ₦${product.price.toLocaleString("en-NG")}. Review the updated total before paying.`,
        productId: String(product._id),
        productName: product.name,
        expectedUnitPrice: expected,
        currentUnitPrice: product.price,
      });
    }

    validLines.push({
      product,
      quantity: item.quantity,
      expectedUnitPrice: expected,
    });
  }

  let address: CheckoutAddressSnapshot | null = null;

  if (input.addressId) {
    const stored = await Address.findOne({
      _id: input.addressId,
      customer: input.customerId,
    });

    if (!stored) {
      issues.push({
        code: "address_invalid",
        message: "Select a delivery address before checking out.",
      });
    } else {
      address = addressSnapshot(stored);
    }
  }

  const storeIds = [
    ...new Set(validLines.map((line) => String(line.product.store))),
  ];
  const stores = await Store.find({ _id: { $in: storeIds } });
  const storeMap = new Map(stores.map((store) => [String(store._id), store]));

  const grouped = new Map<
    string,
    Array<{
      product: (typeof products)[number];
      quantity: number;
      expectedUnitPrice: number | null;
    }>
  >();

  for (const line of validLines) {
    const key = String(line.product.store);
    const rows = grouped.get(key) ?? [];
    rows.push(line);
    grouped.set(key, rows);
  }

  const groups: CheckoutGroup[] = [];
  const deliverySelections = input.deliverySelections ?? {};

  for (const [storeId, rows] of grouped.entries()) {
    const store = storeMap.get(storeId);

    if (!store) {
      issues.push({
        code: "store_unavailable",
        message: "A store in your cart could not be loaded. Remove its products to continue.",
        storeId,
      });
      continue;
    }

    const lines: CheckoutLine[] = rows.map((row) => ({
      product: String(row.product._id),
      name: row.product.name,
      image: productImage(row.product.images),
      category: row.product.category,
      quantity: row.quantity,
      unitPrice: row.product.price,
      compareAtPrice:
        row.product.compareAtPrice &&
        row.product.compareAtPrice > row.product.price
          ? row.product.compareAtPrice
          : null,
      lineTotal: row.product.price * row.quantity,
      expectedUnitPrice: row.expectedUnitPrice,
      priceChanged:
        row.expectedUnitPrice !== null &&
        row.expectedUnitPrice !== row.product.price,
    }));

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

    let delivery: StoreDeliveryQuote;

    if (!address) {
      delivery = {
        available: false,
        options: [],
        selectedOptionId: null,
        message: "Choose a delivery address to see delivery options.",
      };
    } else {
      delivery = await quoteStoreDelivery(
        {
          _id: store._id,
          name: store.name,
          email: store.email,
          phoneNumber: store.phoneNumber,
          address: store.address
            ? {
                street: store.address.street,
                city: store.address.city,
                lga: store.address.lga,
                state: store.address.state,
                country: store.address.country,
              }
            : null,
        },
        deliveryAddressFromSnapshot(address),
        lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        {
          subtotal,
          settings,
          fetchImpl: options.fetchImpl,
        },
      );

      if (!delivery.available) {
        issues.push({
          code: "delivery_unavailable",
          message:
            delivery.message ??
            `Delivery is not available for ${store.name} at this address.`,
          storeId,
        });
      }
    }

    const selected = selectDeliveryOption(
      delivery,
      deliverySelections[storeId] ?? null,
    );
    const deliveryFee = selected?.fee ?? 0;
    const expectedAt = estimatedDeliveryAt(
      { ...delivery, selectedOptionId: selected?.id ?? null },
      now,
    );

    groups.push({
      store: {
        _id: String(store._id),
        name: store.name,
        slug: store.slug,
        logo: store.logo ?? null,
        city: store.address?.city ?? null,
        state: store.address?.state ?? null,
      },
      vendor: String(store.owner),
      items: lines,
      subtotal,
      delivery: {
        ...delivery,
        selectedOptionId: selected?.id ?? null,
      },
      selectedDelivery: selected,
      deliveryFee,
      discount: 0,
      total: subtotal + deliveryFee,
      estimatedDeliveryAt: expectedAt ? expectedAt.toISOString() : null,
    });
  }

  groups.sort((left, right) => left.store.name.localeCompare(right.store.name));

  const summary: CheckoutSummary = {
    currency: "NGN",
    itemCount: groups.reduce(
      (sum, group) =>
        sum + group.items.reduce((count, line) => count + line.quantity, 0),
      0,
    ),
    subtotal: groups.reduce((sum, group) => sum + group.subtotal, 0),
    deliveryFee: groups.reduce((sum, group) => sum + group.deliveryFee, 0),
    serviceFee: 0,
    discount: groups.reduce((sum, group) => sum + group.discount, 0),
    total: groups.reduce((sum, group) => sum + group.total, 0),
  };

  const deliveryAvailable =
    Boolean(address) &&
    groups.length > 0 &&
    groups.every((group) => Boolean(group.selectedDelivery));

  return {
    groups,
    summary,
    issues,
    address,
    deliveryAvailable,
    blocking: issues.some(isBlockingIssue),
    fingerprint: checkoutFingerprint(
      items,
      input.addressId,
      input.deliverySelections,
    ),
  };
}
