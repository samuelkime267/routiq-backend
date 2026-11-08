/**
 * Seeds a realistic marketplace history so the admin dashboard can be verified
 * against real aggregation output.
 *
 * Scope: only records tied to `@demo.routiq.test` accounts and activity events
 * marked `metadata.demo` are deleted or created. Existing accounts, stores and
 * events are untouched.
 *
 * Run with `npm run seed:dashboard`.
 */

import mongoose from "mongoose";
import ActivityEvent from "@/models/activityEvent.model";
import Dispute, { type DisputeDocument } from "@/models/dispute.model";
import Escrow, { type EscrowDocument } from "@/models/escrow.model";
import Order, { type OrderDocument } from "@/models/order.model";
import Payment, { type PaymentDocument } from "@/models/payment.model";
import Product, { type ProductDocument } from "@/models/product.model";
import Shipment, { type ShipmentDocument } from "@/models/shipment.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import { MONGO_URL } from "@/config/env";
import { platformFeeFor, vendorAmountFor } from "@/config/marketplace";

const DEMO_EMAIL = /@demo\.routiq\.test$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const now = new Date();

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random helpers                                 */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261104);
const randInt = (min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;
const pick = <T>(values: readonly T[]): T =>
  values[Math.floor(random() * values.length)];
const chance = (probability: number) => random() < probability;
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * DAY_MS - randInt(0, 20) * 60 * 60 * 1000);
const roundTo = (value: number, step: number) =>
  Math.max(step, Math.round(value / step) * step);

/* ------------------------------------------------------------------ */
/* Fixture data                                                        */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = [
  "Adebayo", "Chiamaka", "Yusuf", "Ngozi", "Tunde", "Aisha", "Emeka",
  "Funke", "Ibrahim", "Bisi", "Kelechi", "Zainab", "Segun", "Amaka",
  "Musa", "Titilayo", "Chinedu", "Halima", "Femi", "Ada", "Bola",
  "Ifeoma", "Sani", "Damilola", "Obinna", "Rukayat", "Kunle", "Ebere",
] as const;

const LAST_NAMES = [
  "Okafor", "Adeyemi", "Bello", "Eze", "Musa", "Ogunleye", "Nwosu",
  "Abubakar", "Balogun", "Chukwu", "Danjuma", "Afolabi", "Okonkwo",
  "Lawal", "Obi", "Suleiman", "Oladipo", "Umeh",
] as const;

const CITIES = [
  { city: "Lagos", lga: "Ikeja", state: "Lagos", coordinates: [3.3792, 6.5244] },
  { city: "Abuja", lga: "Abuja Municipal", state: "Federal Capital Territory", coordinates: [7.3986, 9.0765] },
  { city: "Port Harcourt", lga: "Port Harcourt", state: "Rivers", coordinates: [7.0134, 4.8156] },
  { city: "Ibadan", lga: "Ibadan North", state: "Oyo", coordinates: [3.947, 7.3775] },
  { city: "Kano", lga: "Nassarawa", state: "Kano", coordinates: [8.5167, 12.0022] },
  { city: "Enugu", lga: "Enugu North", state: "Enugu", coordinates: [7.4988, 6.4402] },
  { city: "Benin City", lga: "Oredo", state: "Edo", coordinates: [5.6037, 6.335] },
  { city: "Kaduna", lga: "Kaduna North", state: "Kaduna", coordinates: [7.4388, 10.5105] },
] as const;

const STORE_SEEDS = [
  { name: "Amaka Fabrics", category: "Fashion & Apparel", businessType: "sole_proprietorship" },
  { name: "TechHub Lagos", category: "Electronics", businessType: "limited_company" },
  { name: "Green Basket Grocers", category: "Groceries", businessType: "limited_company" },
  { name: "Glow Beauty Bar", category: "Beauty & Personal Care", businessType: "sole_proprietorship" },
  { name: "Kano Leather Works", category: "Fashion & Apparel", businessType: "partnership" },
  { name: "Home Essentials NG", category: "Home & Living", businessType: "limited_company" },
  { name: "PhonePlug Arena", category: "Phones & Accessories", businessType: "individual" },
  { name: "Wellness Roots", category: "Health & Wellness", businessType: "sole_proprietorship" },
  { name: "Little Ones Hub", category: "Baby & Kids", businessType: "limited_company" },
  { name: "TrailGear Nigeria", category: "Sports & Outdoor", businessType: "partnership" },
  { name: "Pages & Pens", category: "Books & Stationery", businessType: "individual" },
  { name: "Naija Snack Box", category: "Groceries", businessType: "sole_proprietorship" },
  { name: "Urban Sole", category: "Fashion & Apparel", businessType: "limited_company" },
  { name: "Bright Electricals", category: "Electronics", businessType: "partnership" },
] as const;

const PRODUCTS_BY_CATEGORY: Record<string, { name: string; price: number }[]> = {
  "Fashion & Apparel": [
    { name: "Ankara Print Wrap Dress", price: 28500 },
    { name: "Adire Cotton Shirt", price: 18000 },
    { name: "Aso-Oke Head Wrap", price: 12500 },
    { name: "Leather Slides", price: 32000 },
    { name: "Kaftan Lounge Set", price: 42000 },
    { name: "Beaded Statement Necklace", price: 9500 },
  ],
  Electronics: [
    { name: "65W GaN Charger", price: 24500 },
    { name: "Bluetooth Soundbar", price: 89000 },
    { name: "Solar Inverter 1.5kVA", price: 265000 },
    { name: "Wireless Keyboard", price: 27500 },
    { name: "4K Streaming Stick", price: 48000 },
    { name: "Power Bank 20000mAh", price: 31500 },
  ],
  Groceries: [
    { name: "Ofada Rice 5kg", price: 13500 },
    { name: "Cold-Pressed Palm Oil 2L", price: 8200 },
    { name: "Snack Box Bundle", price: 6500 },
    { name: "Dried Pepper Mix 500g", price: 4800 },
    { name: "Honey 1L", price: 9500 },
    { name: "Cassava Flour 2kg", price: 5600 },
  ],
  "Beauty & Personal Care": [
    { name: "Shea Butter Body Cream", price: 7800 },
    { name: "Black Soap Cleanser", price: 5200 },
    { name: "Argan Hair Oil", price: 11500 },
    { name: "Vitamin C Serum", price: 16400 },
    { name: "Bridal Glow Kit", price: 38000 },
    { name: "Lip Care Duo", price: 4500 },
  ],
  "Home & Living": [
    { name: "Woven Storage Basket", price: 15500 },
    { name: "Cotton Throw Blanket", price: 22500 },
    { name: "Ceramic Dinner Set", price: 54000 },
    { name: "Rattan Floor Lamp", price: 46500 },
    { name: "Scented Candle Trio", price: 18500 },
    { name: "Kitchen Utensil Set", price: 21000 },
  ],
  "Phones & Accessories": [
    { name: "Tempered Glass Protector", price: 3500 },
    { name: "Magnetic Phone Holder", price: 6800 },
    { name: "USB-C Fast Cable", price: 4200 },
    { name: "Phone Ring Stand", price: 2500 },
    { name: "Silicone Phone Case", price: 5500 },
    { name: "Car Charger Duo", price: 7900 },
  ],
  "Health & Wellness": [
    { name: "Moringa Capsules", price: 9800 },
    { name: "Herbal Detox Tea", price: 6200 },
    { name: "Massage Recovery Roller", price: 14500 },
    { name: "Immune Boost Pack", price: 18500 },
    { name: "Posture Support Belt", price: 12800 },
    { name: "Sleep Well Diffuser", price: 24500 },
  ],
  "Baby & Kids": [
    { name: "Cotton Baby Onesie Pack", price: 14500 },
    { name: "Wooden Learning Puzzle", price: 8500 },
    { name: "Baby Bath Bundle", price: 16500 },
    { name: "Toddler Sneakers", price: 19500 },
    { name: "Nursery Storage Bin", price: 11000 },
    { name: "Soft Play Mat", price: 28500 },
  ],
  "Sports & Outdoor": [
    { name: "Yoga Mat 6mm", price: 15500 },
    { name: "Resistance Band Set", price: 9500 },
    { name: "Trail Running Shoes", price: 48000 },
    { name: "Camping Hammock", price: 26500 },
    { name: "Insulated Water Bottle", price: 12500 },
    { name: "Adjustable Dumbbell", price: 52000 },
  ],
  "Books & Stationery": [
    { name: "Hardcover Notebook Set", price: 7500 },
    { name: "Fountain Pen Gift Box", price: 18500 },
    { name: "Children's Story Collection", price: 13500 },
    { name: "Desk Organiser", price: 9800 },
    { name: "Sketch Pad A4", price: 4500 },
    { name: "2026 Planner", price: 8500 },
  ],
};

const DISPUTE_TYPES = [
  "non_delivery",
  "damaged_item",
  "wrong_item",
  "refund",
  "payment",
] as const;

const DISPUTE_SUBJECTS: Record<string, string> = {
  non_delivery: "Order not delivered after the promised date",
  damaged_item: "Item arrived damaged",
  wrong_item: "Received the wrong item",
  refund: "Refund not received",
  payment: "Payment charged twice",
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const customerName = () =>
  `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

/* ------------------------------------------------------------------ */
/* Seed                                                               */
/* ------------------------------------------------------------------ */

async function clearDemoData() {
  const demoUsers = await User.find({ email: DEMO_EMAIL }).select("_id");
  const userIds = demoUsers.map((user) => user._id);

  const demoStores = await Store.find({
    $or: [{ owner: { $in: userIds } }, { email: DEMO_EMAIL }],
  }).select("_id");
  const storeIds = demoStores.map((store) => store._id);

  const demoOrders = await Order.find({
    $or: [
      { customer: { $in: userIds } },
      { vendor: { $in: userIds } },
      { store: { $in: storeIds } },
    ],
  }).select("_id");
  const orderIds = demoOrders.map((order) => order._id);

  await Promise.all([
    ActivityEvent.deleteMany({ "metadata.demo": true }),
    Escrow.deleteMany({ order: { $in: orderIds } }),
    Shipment.deleteMany({ order: { $in: orderIds } }),
    Dispute.deleteMany({ order: { $in: orderIds } }),
    Payment.deleteMany({ order: { $in: orderIds } }),
    Order.deleteMany({ _id: { $in: orderIds } }),
    Product.deleteMany({
      $or: [{ vendor: { $in: userIds } }, { store: { $in: storeIds } }],
    }),
    Store.deleteMany({ _id: { $in: storeIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
}

async function seed() {
  const admin = await User.findOne({
    role: "admin",
    adminRole: "SUPER_ADMIN",
  }).select("name adminRole");

  await clearDemoData();

  /* Customers ------------------------------------------------------- */
  const customerDocs = Array.from({ length: 36 }, (_, index) => {
    const name = customerName();
    const createdAt = daysAgo(randInt(3, 300));

    return {
      name,
      username: `demo.customer${index + 1}`,
      email: `customer${String(index + 1).padStart(2, "0")}@demo.routiq.test`,
      role: "user" as const,
      status: "active" as const,
      isEmailVerified: true,
      createdAt,
      updatedAt: createdAt,
    };
  });

  const customers = await User.insertMany(customerDocs);

  /* Vendors --------------------------------------------------------- */
  const vendorDocs = Array.from({ length: 14 }, (_, index) => {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const createdAt = daysAgo(randInt(1, 150));

    return {
      name,
      username: `demo.vendor${index + 1}`,
      email: `vendor${String(index + 1).padStart(2, "0")}@demo.routiq.test`,
      role: "vendor" as const,
      status: index >= 12 ? ("inactive" as const) : ("active" as const),
      isEmailVerified: true,
      createdAt,
      updatedAt: createdAt,
    };
  });

  const vendors = await User.insertMany(vendorDocs);

  /* Stores ---------------------------------------------------------- */
  const storeStatuses = [
    "approved", "approved", "approved", "approved", "approved",
    "approved", "approved", "approved", "approved", "approved",
    "pending", "pending", "rejected", "suspended",
  ] as const;

  const storeDocs = STORE_SEEDS.map((seedStore, index) => {
    const vendor = vendors[index];
    const location = pick(CITIES);
    const createdAt = new Date(
      Math.max(
        new Date(vendor.createdAt as Date).getTime() + 2 * 24 * 60 * 60 * 1000,
        daysAgo(randInt(1, 110)).getTime(),
      ),
    );
    const status = storeStatuses[index];
    const reviewedAt =
      status === "approved" || status === "rejected"
        ? new Date(createdAt.getTime() + randInt(6, 96) * 60 * 60 * 1000)
        : null;

    return {
      owner: vendor._id,
      name: seedStore.name,
      legalBusinessName: `${seedStore.name} Limited`,
      slug: `${slugify(seedStore.name)}-demo`,
      email: `store${index + 1}@demo.routiq.test`,
      phoneNumber: `080${randInt(10000000, 99999999)}`,
      description: `${seedStore.name} sells curated ${seedStore.category.toLowerCase()} products across Nigeria.`,
      businessType: seedStore.businessType,
      category: seedStore.category,
      status,
      rejectionReason:
        status === "rejected" ? "CAC certificate did not match the business name." : null,
      submittedAt: createdAt,
      reviewedAt,
      reviewedBy: reviewedAt ? admin?._id ?? null : null,
      address: {
        street: `${randInt(1, 120)} ${pick(["Adeola Odeku", "Awolowo", "Ahmadu Bello", "Marina", "Ogunlana"])} Street`,
        city: location.city,
        lga: location.lga,
        state: location.state,
        country: "Nigeria",
      },
      location: {
        type: "Point" as const,
        coordinates: [
          location.coordinates[0] + (random() - 0.5) * 0.05,
          location.coordinates[1] + (random() - 0.5) * 0.05,
        ],
      },
      operatingHours: [
        { day: "monday", isOpen: true, openingTime: "08:00", closingTime: "18:00" },
        { day: "saturday", isOpen: true, openingTime: "09:00", closingTime: "16:00" },
        { day: "sunday", isOpen: false },
      ],
      representative: {
        fullName: vendor.name,
        dateOfBirth: new Date("1990-04-12"),
        nationality: "Nigerian",
        idType: "nin" as const,
        idNumber: `NIN${randInt(100000000, 999999999)}`,
      },
      settlementAccount: {
        bankName: pick(["GTBank", "Access Bank", "Zenith Bank", "UBA"]),
        bankCode: "058",
        accountName: vendor.name,
        accountNumber: `01${randInt(10000000, 99999999)}`,
      },
      documents: [],
      compliance: {
        termsAccepted: true,
        dataProcessingConsent: true,
        acceptedAt: createdAt,
      },
      createdAt,
      updatedAt: reviewedAt ?? createdAt,
    };
  });

  const stores = await Store.insertMany(storeDocs);
  const approvedStores = stores.filter((store) => store.status === "approved");

  /* Products -------------------------------------------------------- */
  const productDocs: Record<string, unknown>[] = [];
  let productIndex = 0;

  for (const store of approvedStores) {
    const catalogue = PRODUCTS_BY_CATEGORY[store.category] ?? PRODUCTS_BY_CATEGORY["Home & Living"];
    const count = randInt(4, 5);

    for (let index = 0; index < count; index += 1) {
      const template = catalogue[(index + randInt(0, 2)) % catalogue.length];
      const createdAt = daysAgo(randInt(1, 120));
      const status = index === 4 ? (chance(0.5) ? "pending" : "rejected") : "approved";
      const reviewedAt =
        status === "approved"
          ? new Date(createdAt.getTime() + randInt(2, 72) * 60 * 60 * 1000)
          : status === "rejected"
            ? new Date(createdAt.getTime() + randInt(2, 72) * 60 * 60 * 1000)
            : null;

      productIndex += 1;
      productDocs.push({
        store: store._id,
        vendor: store.owner,
        name: `${template.name}${index > 2 ? " — Limited" : ""}`,
        slug: `${slugify(template.name)}-${productIndex}-demo`,
        sku: `SKU-${String(productIndex).padStart(4, "0")}`,
        category: store.category,
        description: `${template.name} from ${store.name}.`,
        price: roundTo(template.price * (0.85 + random() * 0.3), 500),
        compareAtPrice: null,
        stock: randInt(0, 120),
        images: [],
        status,
        publicationStatus: status === "approved" ? "published" : "unpublished",
        rejectionReason:
          status === "rejected" ? "Product images do not meet catalogue guidelines." : null,
        reviewedBy: reviewedAt ? admin?._id ?? null : null,
        reviewedAt,
        createdAt,
        updatedAt: reviewedAt ?? createdAt,
      });
    }
  }

  // A few additional pending listings from active stores.
  for (const store of approvedStores.slice(0, 4)) {
    const catalogue = PRODUCTS_BY_CATEGORY[store.category] ?? [];
    const template = catalogue[0];
    if (!template) continue;

    const createdAt = daysAgo(randInt(0, 4));
    productIndex += 1;
    productDocs.push({
      store: store._id,
      vendor: store.owner,
      name: `${template.name} — New Arrival`,
      slug: `${slugify(template.name)}-new-${productIndex}-demo`,
      sku: `SKU-${String(productIndex).padStart(4, "0")}`,
      category: store.category,
      description: `${template.name} newly submitted for moderation.`,
      price: roundTo(template.price, 500),
      stock: randInt(5, 60),
      images: [],
      status: "pending",
      publicationStatus: "unpublished",
      reviewedAt: null,
      reviewedBy: null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const products = (await Product.insertMany(
    productDocs,
  )) as unknown as ProductDocument[];

  /* Orders, payments, escrow, shipments ----------------------------- */
  const approvedProducts = products.filter((product) => product.status === "approved");
  const orderDocs: Record<string, unknown>[] = [];
  const paymentPlans: {
    orderIndex: number;
    status: "successful" | "pending" | "failed" | "refunded";
    failedReason?: string;
  }[] = [];

  const orderCount = 190;

  for (let index = 0; index < orderCount; index += 1) {
    const store = pick(approvedStores);
    const catalogue = approvedProducts.filter(
      (product) => String(product.store) === String(store._id),
    );

    if (!catalogue.length) continue;

    const customer = pick(customers);
    const itemCount = randInt(1, 3);
    const items = Array.from({ length: itemCount }, () => {
      const product = pick(catalogue);
      const quantity = randInt(1, 2);
      const unitPrice = product.price;

      return {
        product: product._id,
        name: product.name,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
      };
    });

    // Bias order dates towards recent days so the charts show momentum.
    const ageDays = Math.pow(random(), 1.6) * 90;
    const createdAt = daysAgo(ageDays);
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const shippingFee = pick([1500, 2000, 2500, 3000, 4500]);
    const total = subtotal + shippingFee;

    let status: string;
    if (ageDays > 12) {
      status = chance(0.84)
        ? "delivered"
        : chance(0.5)
          ? "cancelled"
          : "shipped";
    } else if (ageDays > 4) {
      status = chance(0.62)
        ? "delivered"
        : chance(0.5)
          ? "shipped"
          : chance(0.6)
            ? "processing"
            : "cancelled";
    } else {
      status = pick(["pending", "confirmed", "processing", "shipped", "delivered"]);
    }

    const expectedDeliveryAt = new Date(
      createdAt.getTime() + randInt(3, 9) * DAY_MS,
    );
    const deliveredAt =
      status === "delivered"
        ? new Date(createdAt.getTime() + randInt(2, 8) * DAY_MS)
        : null;

    let paymentStatus: "pending" | "paid" | "failed" | "refunded";
    if (status === "cancelled") paymentStatus = "refunded";
    else if (status === "refunded") paymentStatus = "refunded";
    else if (status === "pending") paymentStatus = chance(0.65) ? "pending" : "failed";
    else paymentStatus = "paid";

    orderDocs.push({
      orderNumber: `RQ-${100000 + index}`,
      customer: customer._id,
      store: store._id,
      vendor: store.owner,
      items,
      subtotal,
      shippingFee,
      total,
      status,
      paymentStatus,
      shippingCity: pick(CITIES).city,
      shippingState: pick(CITIES).state,
      placedAt: createdAt,
      expectedDeliveryAt,
      deliveredAt,
      cancelledAt:
        status === "cancelled"
          ? new Date(createdAt.getTime() + randInt(1, 3) * DAY_MS)
          : null,
      createdAt,
      updatedAt: deliveredAt ?? createdAt,
    });

    if (paymentStatus === "paid") {
      paymentPlans.push({ orderIndex: orderDocs.length - 1, status: "successful" });
    } else if (paymentStatus === "refunded") {
      paymentPlans.push({ orderIndex: orderDocs.length - 1, status: "refunded" });
    } else if (paymentStatus === "failed") {
      paymentPlans.push({
        orderIndex: orderDocs.length - 1,
        status: "failed",
        failedReason: pick([
          "Insufficient funds",
          "Card declined by issuer",
          "Transaction timed out",
        ]),
      });
    } else {
      paymentPlans.push({ orderIndex: orderDocs.length - 1, status: "pending" });
    }
  }

  const orders = (await Order.insertMany(
    orderDocs,
  )) as unknown as OrderDocument[];

  const paymentDocs: Record<string, unknown>[] = [];
  const escrowDocs: Record<string, unknown>[] = [];
  const shipmentDocs: Record<string, unknown>[] = [];

  paymentPlans.forEach((plan, planIndex) => {
    const order = orders[plan.orderIndex];
    const paidAt =
      plan.status === "successful" || plan.status === "refunded"
        ? new Date(
            new Date(order.createdAt as Date).getTime() +
              randInt(5, 180) * 60 * 1000,
          )
        : null;
    const platformFee =
      plan.status === "successful" || plan.status === "refunded"
        ? platformFeeFor(order.total)
        : 0;

    paymentDocs.push({
      reference: `PAY-${String(200000 + planIndex)}`,
      order: order._id,
      customer: order.customer,
      store: order.store,
      vendor: order.vendor,
      amount: order.total,
      platformFee,
      vendorAmount:
        plan.status === "successful" || plan.status === "refunded"
          ? vendorAmountFor(order.total)
          : 0,
      currency: "NGN",
      status: plan.status,
      channel: pick(["card", "bank_transfer", "ussd", "wallet"]),
      paidAt,
      failureReason: plan.failedReason ?? null,
      createdAt: new Date(
        new Date(order.createdAt as Date).getTime() + 2 * 60 * 1000,
      ),
      updatedAt: paidAt ?? new Date(order.createdAt as Date),
    });
  });

  const payments = (await Payment.insertMany(
    paymentDocs,
  )) as unknown as PaymentDocument[];
  const successfulPayments = payments.filter(
    (payment) => payment.status === "successful",
  );

  for (const payment of successfulPayments) {
    const order = orders.find(
      (candidate) => String(candidate._id) === String(payment.order),
    );
    if (!order) continue;

    const released = order.status === "delivered" && chance(0.8);
    const heldAt = payment.paidAt ?? new Date();
    const releaseDueAt = new Date(heldAt.getTime() + 7 * DAY_MS);

    escrowDocs.push({
      order: order._id,
      payment: payment._id,
      store: order.store,
      vendor: order.vendor,
      amountHeld: payment.vendorAmount,
      amountReleased: released ? payment.vendorAmount : 0,
      amountRefunded: 0,
      status: released ? "released" : "held",
      heldAt,
      releaseDueAt,
      releasedAt: released ? releaseDueAt : null,
      createdAt: heldAt,
      updatedAt: released ? releaseDueAt : heldAt,
    });
  }

  // Refunded orders return the vendor proceeds from escrow.
  const refundedPayments = payments.filter(
    (payment) => payment.status === "refunded",
  );

  for (const payment of refundedPayments) {
    const order = orders.find(
      (candidate) => String(candidate._id) === String(payment.order),
    );
    if (!order) continue;

    escrowDocs.push({
      order: order._id,
      payment: payment._id,
      store: order.store,
      vendor: order.vendor,
      amountHeld: payment.vendorAmount,
      amountReleased: 0,
      amountRefunded: payment.vendorAmount,
      status: "refunded",
      heldAt: payment.paidAt ?? new Date(),
      releaseDueAt: null,
      releasedAt: null,
      createdAt: payment.paidAt ?? new Date(),
      updatedAt: payment.paidAt ?? new Date(),
    });
  }

  for (const order of orders) {
    if (!["shipped", "delivered"].includes(order.status)) continue;

    const failed = order.status === "shipped" && chance(0.16);
    const delivered = order.status === "delivered";
    const lastEventAt = new Date(
      new Date(order.createdAt as Date).getTime() +
        randInt(1, 4) * DAY_MS,
    );

    shipmentDocs.push({
      order: order._id,
      trackingNumber: `SHB-${randInt(10000000, 99999999)}`,
      provider: "shipbubble",
      status: failed ? "failed" : delivered ? "delivered" : "in_transit",
      failureReason: failed
        ? pick([
            "Customer was unavailable at the delivery address",
            "Address could not be located",
            "Package damaged in transit",
          ])
        : null,
      estimatedDeliveryAt: order.expectedDeliveryAt,
      deliveredAt: delivered ? order.deliveredAt : null,
      lastEventAt,
      createdAt: lastEventAt,
      updatedAt: lastEventAt,
    });
  }

  // A handful of in-transit shipments that are now past their ETA produce
  // delayed orders in the pending-actions queue.
  for (const order of orders) {
    if (!["processing", "confirmed"].includes(order.status)) continue;
    if (!chance(0.25)) continue;

    const lastEventAt = new Date(
      new Date(order.createdAt as Date).getTime() + DAY_MS,
    );

    shipmentDocs.push({
      order: order._id,
      trackingNumber: `SHB-${randInt(10000000, 99999999)}`,
      provider: "shipbubble",
      status: "in_transit",
      failureReason: null,
      estimatedDeliveryAt: new Date(now.getTime() - randInt(1, 5) * DAY_MS),
      deliveredAt: null,
      lastEventAt,
      createdAt: lastEventAt,
      updatedAt: lastEventAt,
    });
  }

  const escrows = (await Escrow.insertMany(
    escrowDocs,
  )) as unknown as EscrowDocument[];
  const shipments = (await Shipment.insertMany(
    shipmentDocs,
  )) as unknown as ShipmentDocument[];

  /* Disputes -------------------------------------------------------- */
  const disputeStatuses = [
    "open", "open", "investigating", "investigating",
    "resolved", "resolved", "resolved", "closed",
  ] as const;
  const disputableOrders = orders.filter((order) =>
    ["delivered", "shipped"].includes(order.status),
  );

  const disputeDocs = disputeStatuses.map((status, index) => {
    const order = disputableOrders[(index * 7 + 3) % disputableOrders.length];
    const type = DISPUTE_TYPES[index % DISPUTE_TYPES.length];
    const createdAt = new Date(
      new Date(order.createdAt as Date).getTime() + randInt(2, 10) * DAY_MS,
    );
    const resolvedAt =
      status === "resolved" || status === "closed"
        ? new Date(createdAt.getTime() + randInt(1, 4) * DAY_MS)
        : null;

    return {
      reference: `DSP-${String(3000 + index)}`,
      order: order._id,
      raisedBy: order.customer,
      store: order.store,
      vendor: order.vendor,
      type,
      status,
      priority: pick(["low", "medium", "high"]),
      subject: DISPUTE_SUBJECTS[type],
      description: `${DISPUTE_SUBJECTS[type]} on order ${order.orderNumber}.`,
      resolution:
        resolvedAt ? "Resolved after review with the customer and vendor." : null,
      resolvedAt,
      createdAt,
      updatedAt: resolvedAt ?? createdAt,
    };
  });

  const disputes = (await Dispute.insertMany(
    disputeDocs,
  )) as unknown as DisputeDocument[];

  /* Activity feed --------------------------------------------------- */
  const activityDocs: Record<string, unknown>[] = [];
  const adminActor = {
    actorId: admin?._id ?? null,
    actorName: admin?.name ?? "Routiq Admin",
    actorRole: admin?.adminRole ?? "SUPER_ADMIN",
  };

  for (const vendor of vendors) {
    activityDocs.push({
      type: "vendor_registered",
      channel: "marketplace",
      title: "New vendor registered",
      description: `${vendor.name} joined the marketplace as a vendor.`,
      actorId: vendor._id,
      actorName: vendor.name,
      actorRole: "vendor",
      subjectType: "vendor",
      subjectId: vendor._id,
      subjectLabel: vendor.name,
      href: `/vendors?search=${encodeURIComponent(vendor.email)}`,
      metadata: { demo: true },
      createdAt: vendor.createdAt,
      updatedAt: vendor.createdAt,
    });
  }

  for (const store of stores) {
    activityDocs.push({
      type: "store_submitted",
      channel: "marketplace",
      title: "New store submitted",
      description: `${store.name} was submitted for onboarding review.`,
      actorId: store.owner,
      actorName: vendors.find(
        (vendor) => String(vendor._id) === String(store.owner),
      )?.name ?? "Vendor",
      actorRole: "vendor",
      subjectType: "store",
      subjectId: store._id,
      subjectLabel: store.name,
      href: `/vendors?search=${encodeURIComponent(store.name)}`,
      metadata: { demo: true, status: "pending" },
      createdAt: store.submittedAt,
      updatedAt: store.submittedAt,
    });

    if (store.reviewedAt && (store.status === "approved" || store.status === "rejected")) {
      activityDocs.push({
        type: store.status === "approved" ? "store_approved" : "store_rejected",
        channel: "marketplace",
        title: store.status === "approved" ? "Store approved" : "Store rejected",
        description: `${store.name} was ${store.status} by ${adminActor.actorName}.`,
        ...adminActor,
        subjectType: "store",
        subjectId: store._id,
        subjectLabel: store.name,
        href: `/vendors?search=${encodeURIComponent(store.name)}`,
        metadata: { demo: true, status: store.status },
        createdAt: store.reviewedAt,
        updatedAt: store.reviewedAt,
      });
    }
  }

  for (const product of products) {
    if (!product.reviewedAt || !["approved", "rejected"].includes(product.status)) {
      continue;
    }

    activityDocs.push({
      type: product.status === "approved" ? "product_approved" : "product_rejected",
      channel: "marketplace",
      title:
        product.status === "approved"
          ? "Product approved"
          : "Product rejected",
      description: `${product.name} was ${product.status} by ${adminActor.actorName}.`,
      ...adminActor,
      subjectType: "product",
      subjectId: product._id,
      subjectLabel: product.name,
      href: `/products?search=${encodeURIComponent(product.name)}`,
      metadata: { demo: true, status: product.status },
      createdAt: product.reviewedAt,
      updatedAt: product.reviewedAt,
    });
  }

  for (const order of orders) {
    activityDocs.push({
      type: "order_created",
      channel: "marketplace",
      title: "New order placed",
      description: `${order.orderNumber} was placed for ₦${order.total.toLocaleString("en-NG")}.`,
      actorId: order.customer,
      actorName:
        customers.find((customer) => String(customer._id) === String(order.customer))
          ?.name ?? "Customer",
      actorRole: "user",
      subjectType: "order",
      subjectId: order._id,
      subjectLabel: order.orderNumber,
      href: `/orders?search=${encodeURIComponent(order.orderNumber)}`,
      metadata: { demo: true, status: order.status },
      createdAt: order.createdAt,
      updatedAt: order.createdAt,
    });
  }

  for (const payment of payments) {
    if (payment.status !== "successful") continue;

    activityDocs.push({
      type: "payment_confirmed",
      channel: "marketplace",
      title: "Payment confirmed",
      description: `${payment.reference} settled ₦${payment.amount.toLocaleString("en-NG")}.`,
      actorId: payment.customer,
      actorName:
        customers.find((customer) => String(customer._id) === String(payment.customer))
          ?.name ?? "Customer",
      actorRole: "user",
      subjectType: "payment",
      subjectId: payment._id,
      subjectLabel: payment.reference,
      href: `/payments?search=${encodeURIComponent(payment.reference)}`,
      metadata: { demo: true, amount: payment.amount },
      createdAt: payment.paidAt,
      updatedAt: payment.paidAt,
    });
  }

  for (const shipment of shipments) {
    activityDocs.push({
      type: "shipment_updated",
      channel: "marketplace",
      title:
        shipment.status === "failed"
          ? "Shipment failed"
          : shipment.status === "delivered"
            ? "Shipment delivered"
            : "Shipment in transit",
      description: `${shipment.trackingNumber} is ${shipment.status.replace(/_/g, " ")}.`,
      actorName: "Shipbubble",
      actorRole: "provider",
      subjectType: "shipment",
      subjectId: shipment._id,
      subjectLabel: shipment.trackingNumber,
      href: `/logistics?search=${encodeURIComponent(shipment.trackingNumber)}`,
      metadata: { demo: true, status: shipment.status },
      createdAt: shipment.lastEventAt,
      updatedAt: shipment.lastEventAt,
    });
  }

  for (const dispute of disputes) {
    activityDocs.push({
      type: "dispute_created",
      channel: "marketplace",
      title: "New dispute raised",
      description: `${dispute.reference}: ${dispute.subject}.`,
      actorId: dispute.raisedBy,
      actorName:
        customers.find((customer) => String(customer._id) === String(dispute.raisedBy))
          ?.name ?? "Customer",
      actorRole: "user",
      subjectType: "dispute",
      subjectId: dispute._id,
      subjectLabel: dispute.reference,
      href: `/disputes?search=${encodeURIComponent(dispute.reference)}`,
      metadata: { demo: true, status: dispute.status },
      createdAt: dispute.createdAt,
      updatedAt: dispute.createdAt,
    });
  }

  await ActivityEvent.insertMany(activityDocs);

  /* Summary --------------------------------------------------------- */
  const [gmvRow] = await Order.aggregate<{ total: number }>([
    {
      $match: {
        status: { $nin: ["cancelled", "refunded"] },
      },
    },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);
  const [revenueRow] = await Payment.aggregate<{ total: number }>([
    { $match: { status: "successful" } },
    { $group: { _id: null, total: { $sum: "$platformFee" } } },
  ]);
  const [escrowRow] = await Escrow.aggregate<{ total: number }>([
    { $match: { status: "held" } },
    {
      $group: {
        _id: null,
        total: { $sum: { $subtract: ["$amountHeld", "$amountReleased"] } },
      },
    },
  ]);

  console.log(
    JSON.stringify(
      {
        customers: customers.length,
        vendors: vendors.length,
        stores: stores.length,
        approvedStores: approvedStores.length,
        products: products.length,
        orders: orders.length,
        payments: payments.length,
        escrowEntries: escrows.length,
        shipments: shipments.length,
        disputes: disputes.length,
        activityEvents: activityDocs.length,
        gmvAllTime: gmvRow?.total ?? 0,
        revenueAllTime: revenueRow?.total ?? 0,
        escrowHeld: escrowRow?.total ?? 0,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (!MONGO_URL) throw new Error("MONGO_URL is not configured");

  await mongoose.connect(MONGO_URL);
  await seed();
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
