/**
 * Marketplace-wide constants and money rules.
 *
 * Every monetary field in the marketplace models is stored as a whole Naira
 * (NGN) integer. Fees are rounded once, when the payment is recorded, so the
 * dashboard can sum stored values instead of recomputing rates per query.
 */

export const MARKETPLACE_CURRENCY = "NGN";

/** Platform commission retained from each successful sale (7.5%). */
export const PLATFORM_COMMISSION_RATE = 0.075;

/**
 * Business-day boundaries and chart buckets are resolved in the marketplace
 * operating timezone. Africa/Lagos is UTC+1 all year, so the dashboard range
 * helper can use a fixed offset without a timezone database.
 */
export const BUSINESS_TIMEZONE = "Africa/Lagos";
export const BUSINESS_TIMEZONE_OFFSET_MINUTES = 60;

export function platformFeeFor(amount: number) {
  return Math.round(amount * PLATFORM_COMMISSION_RATE);
}

export function vendorAmountFor(amount: number) {
  return Math.max(0, Math.round(amount) - platformFeeFor(amount));
}
