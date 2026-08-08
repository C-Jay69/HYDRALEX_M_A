import { eq, sql } from "drizzle-orm";
import { db } from "../database.js";
import { userMeta } from "../database/schema.js";

export type PlanId = "free" | "professional" | "business" | "enterprise";

/** Monthly analysis limits per plan. `null` means unlimited. */
export const PLAN_LIMITS: Record<PlanId, number | null> = {
  free: 1,
  professional: 10,
  business: 50,
  enterprise: null,
};

export const PLAN_IDS: PlanId[] = ["free", "professional", "business", "enterprise"];

function nextMonthStart(d: Date): Date {
  const r = new Date(d);
  r.setUTCDate(1);
  r.setUTCHours(0, 0, 0, 0);
  r.setUTCMonth(r.getUTCMonth() + 1);
  return r;
}

export interface QuotaUsage {
  used: number;
  limit: number | null;
  unlimited: boolean;
  resetAt: Date | null;
  plan: PlanId;
}

/**
 * Returns a user's current monthly usage, rolling the counter forward
 * when the month has elapsed and initializing the row on first access.
 */
export async function getQuotaUsage(userId: string): Promise<QuotaUsage> {
  const now = new Date();
  const [meta] = await db
    .select({
      used: userMeta.docsUsedThisMonth,
      resetAt: userMeta.monthResetAt,
      plan: userMeta.plan,
    })
    .from(userMeta)
    .where(eq(userMeta.userId, userId))
    .limit(1);

  if (!meta) {
    const resetAt = nextMonthStart(now);
    await db
      .insert(userMeta)
      .values({ userId, docsUsedThisMonth: 0, monthResetAt: resetAt })
      .onConflictDoNothing();
    return { used: 0, limit: PLAN_LIMITS.free, unlimited: false, resetAt, plan: "free" };
  }

  const plan = (PLAN_LIMITS[meta.plan as PlanId] !== undefined ? meta.plan : "free") as PlanId;
  const limit = PLAN_LIMITS[plan];

  let used = meta.used ?? 0;
  let resetAt = meta.resetAt;
  if (resetAt && resetAt.getTime() <= now.getTime()) {
    used = 0;
    resetAt = nextMonthStart(now);
    await db
      .update(userMeta)
      .set({ docsUsedThisMonth: 0, monthResetAt: resetAt })
      .where(eq(userMeta.userId, userId));
  }

  return { used, limit, unlimited: limit === null, resetAt, plan };
}

/** Counts an analysis against the user's monthly quota. */
export async function incrementAnalysisUsage(userId: string): Promise<void> {
  await db
    .insert(userMeta)
    .values({ userId, docsUsedThisMonth: 1, monthResetAt: nextMonthStart(new Date()) })
    .onConflictDoUpdate({
      target: userMeta.userId,
      set: { docsUsedThisMonth: sql`${userMeta.docsUsedThisMonth} + 1` },
    });
}
