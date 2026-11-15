import crypto from "node:crypto";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";

const dateStamp = (now = new Date()) =>
  now.toISOString().slice(2, 10).replace(/-/g, "");

const randomDigits = (length: number) => {
  let value = "";

  while (value.length < length) {
    value += String(crypto.randomInt(0, 10));
  }

  return value;
};

/**
 * Human-readable marketplace references. Uniqueness is enforced by the model
 * indexes; the helpers retry a few times so a rare collision never fails a
 * checkout.
 */
export async function generateOrderNumbers(count: number) {
  const stamp = dateStamp();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const masterOrderNumber = `RQ-M-${stamp}-${randomDigits(5)}`;
    const orderNumbers = Array.from({ length: count }, (_, index) =>
      `RQ-${stamp}-${randomDigits(4)}${String(index + 1).padStart(2, "0")}`,
    );

    const [masterExists, existing] = await Promise.all([
      Order.exists({ masterOrderNumber }),
      Order.exists({ orderNumber: { $in: orderNumbers } }),
    ]);

    if (!masterExists && !existing) {
      return {
        masterOrderNumber,
        orders: orderNumbers.map((orderNumber, index) => ({
          orderNumber,
          subOrderNumber: `${masterOrderNumber}-${String.fromCharCode(65 + index)}`,
        })),
      };
    }
  }

  throw new Error("Could not allocate order numbers. Please try again.");
}

export async function generatePaymentReferences(count: number) {
  const stamp = dateStamp();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const references = Array.from(
      { length: count },
      () => `PAY-${stamp}-${randomDigits(6)}`,
    );

    const existing = await Payment.exists({ reference: { $in: references } });
    if (!existing) return references;
  }

  throw new Error("Could not allocate payment references. Please try again.");
}

export function generateProviderReference() {
  return `RQ-CO-${Date.now()}-${randomDigits(6)}`;
}
