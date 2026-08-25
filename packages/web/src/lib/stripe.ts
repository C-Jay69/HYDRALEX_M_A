import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.warn(
    "[stripe] STRIPE_SECRET_KEY is not set. Billing endpoints will fail until it is provided.",
  );
}

export const stripe = new Stripe(secretKey ?? "", {
  appInfo: { name: "HYDRALEX M&A" },
});

/** Plans that go through a paid Stripe Checkout. Free is excluded. */
export const PAID_PLANS = ["professional", "business", "enterprise"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** Maps a plan id to the env var holding its Stripe price id. */
export const PLAN_PRICE_ENV: Record<PaidPlan, string> = {
  professional: "HYDRALEX_PROFESSIONAL_PLAN_PRICE_CODE",
  business: "HYDRALEX_BUSINESS_PLAN_PRICE_CODE",
  enterprise: "HYDRALEX_ENTERPRISE_PLAN_PRICE_CODE",
};

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === "string" && (PAID_PLANS as readonly string[]).includes(value);
}
