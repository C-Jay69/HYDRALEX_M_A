import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { autumn } from "autumn-js/better-auth";
import { Autumn } from "autumn-js";
import { db } from "./database";
import { userMeta } from "./database/schema";

const autumnSdk = new Autumn();

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    return origin ? [origin] : ["*"];
  },
  plugins: [bearer(), autumn()],
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          // Create Autumn customer
          try {
            await autumnSdk.customers.getOrCreate({
              customerId: user.id,
              name: user.name,
              email: user.email,
            });
          } catch (e) {
            console.error("[autumn] Failed to create customer on sign-up:", e);
          }
          // Auto-create user_meta row (safe defaults — not admin)
          try {
            await db
              .insert(userMeta)
              .values({ userId: user.id, isAdmin: false, docsUsedThisMonth: 0 })
              .onConflictDoNothing();
          } catch (e) {
            console.error("[auth] Failed to create user_meta on sign-up:", e);
          }
        },
      },
    },
  },
});
