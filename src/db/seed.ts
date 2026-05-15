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

  const topCategories = await db
    .insert(schema.categories)
    .values([
      { name: "Electronics", slug: "electronics", sort_order: 1, icon_name: "smartphone" },
      { name: "Fashion", slug: "fashion", sort_order: 2, icon_name: "shirt" },
      { name: "Home & Living", slug: "home-living", sort_order: 3, icon_name: "home" },
      { name: "Beauty & Personal Care", slug: "beauty", sort_order: 4, icon_name: "sparkles" },
      { name: "Vehicles", slug: "vehicles", sort_order: 5, icon_name: "car" },
      { name: "Property", slug: "property", sort_order: 6, icon_name: "building" },
      { name: "Services", slug: "services", sort_order: 7, icon_name: "wrench" },
      { name: "Food & Beverages", slug: "food-beverages", sort_order: 8, icon_name: "utensils" },
      { name: "Health & Wellness", slug: "health", sort_order: 9, icon_name: "heart-pulse" },
      { name: "Baby & Kids", slug: "baby-kids", sort_order: 10, icon_name: "baby" },
      { name: "Sports & Fitness", slug: "sports", sort_order: 11, icon_name: "dumbbell" },
      { name: "Books & Media", slug: "books-media", sort_order: 12, icon_name: "book-open" },
      { name: "Pets", slug: "pets", sort_order: 13, icon_name: "paw-print" },
      { name: "Industrial & Business", slug: "industrial", sort_order: 14, icon_name: "factory" },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${topCategories.length} top-level categories`);

  const electronics = topCategories.find((c) => c.slug === "electronics");
  const fashion = topCategories.find((c) => c.slug === "fashion");
  const vehicles = topCategories.find((c) => c.slug === "vehicles");

  if (electronics && fashion && vehicles) {
    await db
      .insert(schema.categories)
      .values([
        { name: "Phones", slug: "phones", parent_id: electronics.id, sort_order: 1 },
        { name: "Laptops", slug: "laptops", parent_id: electronics.id, sort_order: 2 },
        { name: "Audio", slug: "audio", parent_id: electronics.id, sort_order: 3 },
        { name: "Gaming", slug: "gaming", parent_id: electronics.id, sort_order: 4 },
        { name: "Accessories", slug: "accessories", parent_id: electronics.id, sort_order: 5 },

        { name: "Men's Wear", slug: "mens-wear", parent_id: fashion.id, sort_order: 1 },
        { name: "Women's Wear", slug: "womens-wear", parent_id: fashion.id, sort_order: 2 },
        { name: "Shoes", slug: "shoes", parent_id: fashion.id, sort_order: 3 },
        { name: "Bags", slug: "bags", parent_id: fashion.id, sort_order: 4 },
        { name: "Watches & Jewelry", slug: "watches-jewelry", parent_id: fashion.id, sort_order: 5 },

        { name: "Cars", slug: "cars", parent_id: vehicles.id, sort_order: 1 },
        { name: "Motorcycles", slug: "motorcycles", parent_id: vehicles.id, sort_order: 2 },
        { name: "Parts & Accessories", slug: "vehicle-parts", parent_id: vehicles.id, sort_order: 3 },
      ])
      .onConflictDoNothing();
    console.log("  ✓ sub-categories for Electronics, Fashion, Vehicles");
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
