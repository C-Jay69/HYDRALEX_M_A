import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { bearer } from "better-auth/plugins";
import { db } from "./database.js";

// Get the frontend URL from environment or use localhost
const frontendUrl = 
  (globalThis as any).process?.env?.FRONTEND_URL ?? 
  (import.meta as any).env?.VITE_FRONTEND_URL ?? 
  "http://localhost:5173";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [bearer()],
  // Add multiple trusted origins for development
  trustedOrigins: [
    frontendUrl,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ],
  // Add CORS configuration
  cors: {
    origin: [
      frontendUrl,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  // Set to false for development
  production: false,
});