import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "dotenv";
import * as schema from "./schema";

config({ path: ".dev.vars" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for seeding");
}

// Direct connection (port 5432) — pooler isn't needed for one-off scripts.
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding...");

  // Slugs match the Phase D P-migration's `lower(replace(name, ' ', '-'))`
  // rule with manual overrides for FCT (→ 'abuja'), Akwa Ibom, and Cross River.
  await db
    .insert(schema.nigerianStates)
    .values([
      { name: "Abia", slug: "abia", iso_code: "NG-AB" },
      { name: "Adamawa", slug: "adamawa", iso_code: "NG-AD" },
      { name: "Akwa Ibom", slug: "akwa-ibom", iso_code: "NG-AK" },
      { name: "Anambra", slug: "anambra", iso_code: "NG-AN" },
      { name: "Bauchi", slug: "bauchi", iso_code: "NG-BA" },
      { name: "Bayelsa", slug: "bayelsa", iso_code: "NG-BY" },
      { name: "Benue", slug: "benue", iso_code: "NG-BE" },
      { name: "Borno", slug: "borno", iso_code: "NG-BO" },
      { name: "Cross River", slug: "cross-river", iso_code: "NG-CR" },
      { name: "Delta", slug: "delta", iso_code: "NG-DE" },
      { name: "Ebonyi", slug: "ebonyi", iso_code: "NG-EB" },
      { name: "Edo", slug: "edo", iso_code: "NG-ED" },
      { name: "Ekiti", slug: "ekiti", iso_code: "NG-EK" },
      { name: "Enugu", slug: "enugu", iso_code: "NG-EN" },
      { name: "Federal Capital Territory", slug: "abuja", iso_code: "NG-FC" },
      { name: "Gombe", slug: "gombe", iso_code: "NG-GO" },
      { name: "Imo", slug: "imo", iso_code: "NG-IM" },
      { name: "Jigawa", slug: "jigawa", iso_code: "NG-JI" },
      { name: "Kaduna", slug: "kaduna", iso_code: "NG-KD" },
      { name: "Kano", slug: "kano", iso_code: "NG-KN" },
      { name: "Katsina", slug: "katsina", iso_code: "NG-KT" },
      { name: "Kebbi", slug: "kebbi", iso_code: "NG-KE" },
      { name: "Kogi", slug: "kogi", iso_code: "NG-KO" },
      { name: "Kwara", slug: "kwara", iso_code: "NG-KW" },
      { name: "Lagos", slug: "lagos", iso_code: "NG-LA" },
      { name: "Nasarawa", slug: "nasarawa", iso_code: "NG-NA" },
      { name: "Niger", slug: "niger", iso_code: "NG-NI" },
      { name: "Ogun", slug: "ogun", iso_code: "NG-OG" },
      { name: "Ondo", slug: "ondo", iso_code: "NG-ON" },
      { name: "Osun", slug: "osun", iso_code: "NG-OS" },
      { name: "Oyo", slug: "oyo", iso_code: "NG-OY" },
      { name: "Plateau", slug: "plateau", iso_code: "NG-PL" },
      { name: "Rivers", slug: "rivers", iso_code: "NG-RI" },
      { name: "Sokoto", slug: "sokoto", iso_code: "NG-SO" },
      { name: "Taraba", slug: "taraba", iso_code: "NG-TA" },
      { name: "Yobe", slug: "yobe", iso_code: "NG-YO" },
      { name: "Zamfara", slug: "zamfara", iso_code: "NG-ZA" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Nigerian states");

  // Phase D taxonomy: 6 Tier 1 (featured) + 4 Tier 2 (standard) + 6 Tier 3
  // (more drawer). Tier values mirror DB column added in Phase D P-migration.
  // sort_order is per-tier display order (1..n within each tier).
  const topCategories = await db
    .insert(schema.categories)
    .values([
      // Tier 1 — featured on home page
      { name: "Fashion & Apparel", slug: "fashion", tier: 1, sort_order: 1, icon_name: "shirt" },
      { name: "Mobile Phones & Tablets", slug: "mobile-phones-tablets", tier: 1, sort_order: 2, icon_name: "smartphone" },
      { name: "Hair & Wigs", slug: "hair-wigs", tier: 1, sort_order: 3, icon_name: "scissors" },
      { name: "Beauty & Personal Care", slug: "beauty", tier: 1, sort_order: 4, icon_name: "sparkles" },
      { name: "Electronics & Gadgets", slug: "electronics", tier: 1, sort_order: 5, icon_name: "cpu" },
      { name: "Home & Furniture", slug: "home-living", tier: 1, sort_order: 6, icon_name: "home" },

      // Tier 2 — in main nav, not on hero
      { name: "Health & Wellness", slug: "health", tier: 2, sort_order: 1, icon_name: "heart-pulse" },
      { name: "Baby & Kids", slug: "baby-kids", tier: 2, sort_order: 2, icon_name: "baby" },
      { name: "Food & Drinks", slug: "food-beverages", tier: 2, sort_order: 3, icon_name: "utensils" },
      { name: "Automotive", slug: "vehicles", tier: 2, sort_order: 4, icon_name: "car" },

      // Tier 3 — "more categories" drawer
      { name: "Property", slug: "property", tier: 3, sort_order: 1, icon_name: "building" },
      { name: "Services", slug: "services", tier: 3, sort_order: 2, icon_name: "wrench" },
      { name: "Sports & Fitness", slug: "sports", tier: 3, sort_order: 3, icon_name: "dumbbell" },
      { name: "Books & Media", slug: "books-media", tier: 3, sort_order: 4, icon_name: "book-open" },
      { name: "Pets", slug: "pets", tier: 3, sort_order: 5, icon_name: "paw-print" },
      { name: "Industrial & Business", slug: "industrial", tier: 3, sort_order: 6, icon_name: "factory" },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${topCategories.length} top-level categories (Tier 1-3)`);

  const fashion = topCategories.find((c) => c.slug === "fashion");
  const mobile = topCategories.find((c) => c.slug === "mobile-phones-tablets");
  const hair = topCategories.find((c) => c.slug === "hair-wigs");
  const electronics = topCategories.find((c) => c.slug === "electronics");

  if (fashion && mobile && hair && electronics) {
    await db
      .insert(schema.categories)
      .values([
        // Fashion & Apparel subs (6)
        { name: "Men's Clothing", slug: "mens-clothing", parent_id: fashion.id, sort_order: 1 },
        { name: "Women's Clothing", slug: "womens-clothing", parent_id: fashion.id, sort_order: 2 },
        { name: "Kids' Clothing", slug: "kids-clothing", parent_id: fashion.id, sort_order: 3 },
        { name: "Traditional / Ankara", slug: "traditional-ankara", parent_id: fashion.id, sort_order: 4 },
        { name: "Shoes", slug: "shoes", parent_id: fashion.id, sort_order: 5 },
        { name: "Accessories", slug: "accessories-fashion", parent_id: fashion.id, sort_order: 6 },

        // Mobile Phones & Tablets subs (5)
        { name: "Smartphones (New)", slug: "smartphones-new", parent_id: mobile.id, sort_order: 1 },
        { name: "Smartphones (Pre-owned)", slug: "smartphones-used", parent_id: mobile.id, sort_order: 2 },
        { name: "Tablets", slug: "tablets", parent_id: mobile.id, sort_order: 3 },
        { name: "Phone Accessories", slug: "phone-accessories", parent_id: mobile.id, sort_order: 4 },
        { name: "Smart Wearables", slug: "smart-wearables", parent_id: mobile.id, sort_order: 5 },

        // Hair & Wigs subs (5)
        { name: "Human Hair Bundles", slug: "human-hair-bundles", parent_id: hair.id, sort_order: 1 },
        { name: "Wigs", slug: "wigs", parent_id: hair.id, sort_order: 2 },
        { name: "Hair Extensions", slug: "hair-extensions", parent_id: hair.id, sort_order: 3 },
        { name: "Closures & Frontals", slug: "closures-frontals", parent_id: hair.id, sort_order: 4 },
        { name: "Hair Care Products", slug: "hair-care-products", parent_id: hair.id, sort_order: 5 },

        // Electronics & Gadgets — 1 sub confirmed in current live DB
        { name: "Accessories", slug: "electronics-accessories", parent_id: electronics.id, sort_order: 1 },
      ])
      .onConflictDoNothing();
    console.log("  ✓ sub-categories for Fashion, Mobile, Hair, Electronics");
  } else {
    console.log("  - top categories already seeded; skipping sub-categories");
  }

  console.log("Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
