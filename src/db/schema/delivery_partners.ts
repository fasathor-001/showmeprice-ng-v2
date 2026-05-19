import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// Empty in Phase E; Phase G+ populates for logistics integrations.
export const deliveryPartners = pgTable("delivery_partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 'logistics' / 'rider_network' / 'self_pickup'
  type: text("type"),
  // Array of state_ids covered (uuid[]).
  coverage_states: uuid("coverage_states").array(),
  base_rate_kobo: bigint("base_rate_kobo", { mode: "number" }),
  api_credentials: jsonb("api_credentials"),
  active: boolean("active").notNull().default(true),
});

export type DeliveryPartner = typeof deliveryPartners.$inferSelect;
export type NewDeliveryPartner = typeof deliveryPartners.$inferInsert;
