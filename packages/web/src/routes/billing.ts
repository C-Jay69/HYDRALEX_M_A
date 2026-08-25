import { Hono } from "hono";
import { stripe, isPaidPlan, PLAN_PRICE_ENV } from "../lib/stripe.js";
import { authMiddleware, requireAuth } from "../middleware/auth.js";
import { db } from "../database.js";
import { userMeta } from "../database/schema.js";
import { PlanId } from "../lib/quota.js";

type AuthUser = { id: string; email?: string };

/**
 * Billing routes: Stripe Checkout session creation + webhook handler.
 * Checkout is auth-protected; the webhook is public but verified via
 * the Stripe-Signature header.
 */
const billing = new Hono()
  .post("/checkout", authMiddleware, requireAuth, async (c) => {
    const user = c.get("user") as AuthUser | null;
    if (!user) return c.json({ message: "Unauthorized" }, 401);

    let body: { plan?: unknown } = {};
    try {
      body = (await c.req.json()) as { plan?: unknown };
    } catch {
      /* ignore malformed body */
    }
    const plan = body?.plan;

    if (!isPaidPlan(plan)) {
      return c.json({ message: "Invalid or missing plan" }, 400);
    }

    const priceCode = process.env[PLAN_PRICE_ENV[plan]];
    if (!priceCode) {
      console.error(`[billing] Missing env ${PLAN_PRICE_ENV[plan]} for plan ${plan}`);
      return c.json({ message: "Price not configured for this plan" }, 500);
    }

    const origin =
      process.env.BETTER_AUTH_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173";

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: user.email,
        client_reference_id: user.id,
        metadata: { userId: user.id, plan },
        subscription_data: { metadata: { userId: user.id, plan } },
        line_items: [{ price: priceCode, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${origin}/pricing?checkout=success&plan=${plan}`,
        cancel_url: `${origin}/pricing?checkout=cancelled`,
      });

      return c.json({ url: session.url });
    } catch (err) {
      console.error("[billing] checkout session create failed:", err);
      return c.json({ message: "Could not start checkout" }, 500);
    }
  })
  .post("/portal", authMiddleware, requireAuth, async (c) => {
    const user = c.get("user") as AuthUser | null;
    if (!user) return c.json({ message: "Unauthorized" }, 401);

    const origin =
      process.env.BETTER_AUTH_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173";

    try {
      // Resolve the user's Stripe customer via the subscription metadata
      // we set at checkout (avoids storing the customer id in our DB).
      // The API supports metadata filtering; the SDK types just don't expose it.
      const subs = await stripe.subscriptions.list({
        metadata: { userId: user.id },
        limit: 5,
      } as any);
      const sub =
        subs.data.find((s) => s.status === "active" || s.status === "trialing") ??
        subs.data[0];

      if (!sub) {
        return c.json({ message: "No active subscription found" }, 404);
      }
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${origin}/pricing`,
      });

      return c.json({ url: session.url });
    } catch (err) {
      console.error("[billing] portal session create failed:", err);
      return c.json({ message: "Could not open billing portal" }, 500);
    }
  })
  .post("/webhook", async (c) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return c.json({ message: "Webhook secret not configured" }, 500);
    }

    const signature = c.req.header("stripe-signature");
    const rawBody = await c.req.text();

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(`[billing] webhook signature verification failed: ${msg}`);
      return c.json({ message: `Webhook error: ${msg}` }, 400);
    }

    const obj = event?.data?.object;
    switch (event?.type) {
      case "checkout.session.completed": {
        await applyPlan(obj?.metadata?.userId, obj?.metadata?.plan);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const userId = obj?.metadata?.userId;
        const plan = obj?.metadata?.plan;
        if (!userId) break;
        if (obj?.status === "active" || obj?.status === "trialing") {
          await applyPlan(userId, plan);
        } else {
          // canceled / unpaid / past_due / incomplete_expired -> revert to free
          await applyPlan(userId, "free");
        }
        break;
      }
      default:
        break;
    }

    return c.json({ received: true });
  });

async function applyPlan(userId: unknown, plan: unknown): Promise<void> {
  if (typeof userId !== "string" || !userId) return;
  const safePlan: PlanId =
    isPaidPlan(plan) || plan === "free" ? (plan as PlanId) : "free";

  await db
    .insert(userMeta)
    .values({ userId, plan: safePlan })
    .onConflictDoUpdate({
      target: userMeta.userId,
      set: { plan: safePlan },
    });
}

export default billing;
