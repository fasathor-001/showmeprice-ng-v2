import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { nigerianStates } from "./nigerian_states";

// Empty in Phase E; Phase G+ populates for fulfillment.
export const shippingAddresses = pgTable("shipping_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  full_name: text("full_name"),
  phone: text("phone"),
  street_address: text("street_address"),
  city: text("city"),
  state_id: uuid("state_id").references(() => nigerianStates.id, {
    onDelete: "set null",
  }),
  postal_code: text("postal_code"),
  is_default: boolean("is_default").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShippingAddress = typeof shippingAddresses.$inferSelect;
export type NewShippingAddress = typeof shippingAddresses.$inferInsert;
