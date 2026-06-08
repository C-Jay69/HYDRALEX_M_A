import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc, count, gte } from "drizzle-orm";
import { authMiddleware, requireAuth } from "../middleware/auth";

// Admin-only middleware
const requireAdmin = async (c: any, next: any) => {
  const user = c.get("user") as any;
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  // Check userMeta for admin flag
  const [meta] = await db
    .select()
    .from(schema.userMeta)
    .where(eq(schema.userMeta.userId, user.id));
  if (!meta?.isAdmin) return c.json({ message: "Forbidden" }, 403);
  return next();
};

export const admin = new Hono()
  .use(authMiddleware)
  .use(requireAuth)
  .use(requireAdmin)

  // Stats overview
  .get("/stats", async (c) => {
    const [totalUsers] = await db
      .select({ count: count() })
      .from(schema.user);

    const [totalAnalyses] = await db
      .select({ count: count() })
      .from(schema.analyses);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayAnalyses] = await db
      .select({ count: count() })
      .from(schema.analyses)
      .where(gte(schema.analyses.createdAt, today));

    const [completedAnalyses] = await db
      .select({ count: count() })
      .from(schema.analyses)
      .where(eq(schema.analyses.status, "complete"));

    const successRate =
      totalAnalyses.count > 0
        ? Math.round((completedAnalyses.count / totalAnalyses.count) * 100)
        : 0;

    return c.json(
      {
        stats: {
          totalUsers: totalUsers.count,
          totalAnalyses: totalAnalyses.count,
          todayAnalyses: todayAnalyses.count,
          completedAnalyses: completedAnalyses.count,
          successRate,
        },
      },
      200
    );
  })

  // Users list
  .get("/users", async (c) => {
    const users = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        createdAt: schema.user.createdAt,
        isAdmin: schema.userMeta.isAdmin,
        docsUsedThisMonth: schema.userMeta.docsUsedThisMonth,
      })
      .from(schema.user)
      .leftJoin(schema.userMeta, eq(schema.userMeta.userId, schema.user.id))
      .orderBy(desc(schema.user.createdAt));

    return c.json({ users }, 200);
  })

  // Single user detail
  .get("/users/:id", async (c) => {
    const id = c.req.param("id");
    const [u] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        createdAt: schema.user.createdAt,
        isAdmin: schema.userMeta.isAdmin,
        docsUsedThisMonth: schema.userMeta.docsUsedThisMonth,
      })
      .from(schema.user)
      .leftJoin(schema.userMeta, eq(schema.userMeta.userId, schema.user.id))
      .where(eq(schema.user.id, id));

    if (!u) return c.json({ error: "User not found" }, 404);

    const userAnalyses = await db
      .select({
        id: schema.analyses.id,
        filename: schema.analyses.filename,
        status: schema.analyses.status,
        score: schema.analyses.score,
        riskLevel: schema.analyses.riskLevel,
        createdAt: schema.analyses.createdAt,
      })
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, id))
      .orderBy(desc(schema.analyses.createdAt))
      .limit(20);

    return c.json({ user: u, analyses: userAnalyses }, 200);
  })

  // Toggle admin
  .patch("/users/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json() as { isAdmin?: boolean };

    if (typeof body.isAdmin === "boolean") {
      const existing = await db
        .select()
        .from(schema.userMeta)
        .where(eq(schema.userMeta.userId, id));

      if (existing.length === 0) {
        await db.insert(schema.userMeta).values({ userId: id, isAdmin: body.isAdmin });
      } else {
        await db
          .update(schema.userMeta)
          .set({ isAdmin: body.isAdmin })
          .where(eq(schema.userMeta.userId, id));
      }
    }

    return c.json({ success: true }, 200);
  })

  // All analyses (admin view)
  .get("/analyses", async (c) => {
    const rows = await db
      .select({
        id: schema.analyses.id,
        userId: schema.analyses.userId,
        filename: schema.analyses.filename,
        status: schema.analyses.status,
        score: schema.analyses.score,
        riskLevel: schema.analyses.riskLevel,
        recommendation: schema.analyses.recommendation,
        reviewPerspective: schema.analyses.reviewPerspective,
        createdAt: schema.analyses.createdAt,
      })
      .from(schema.analyses)
      .orderBy(desc(schema.analyses.createdAt))
      .limit(200);

    return c.json({ analyses: rows }, 200);
  })

  // Audit logs
  .get("/audit-logs", async (c) => {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(500);

    return c.json({ logs }, 200);
  });
