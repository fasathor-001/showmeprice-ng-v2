import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

// Singleton in dev so HMR doesn't exhaust the pool. Production gets a fresh
// connection per worker invocation.
declare global {
  // eslint-disable-next-line no-var
  var __drizzle_client: postgres.Sql | undefined;
}

function getClient() {
  if (!process.env.DATABASE_URL_POOLED) {
    throw new Error("DATABASE_URL_POOLED is not set");
  }

  if (process.env.NODE_ENV === "production") {
    return postgres(process.env.DATABASE_URL_POOLED, {
      // Required for Supabase's transaction-mode pooler (D-016, D-018).
      prepare: false,
      // Edge runtime constraint.
      max: 1,
    });
  }

  if (!global.__drizzle_client) {
    global.__drizzle_client = postgres(process.env.DATABASE_URL_POOLED, {
      prepare: false,
      max: 1,
    });
  }
  return global.__drizzle_client;
}

export const db = drizzle(getClient(), { schema });
