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

  // Phase D taxonomy (post-D.4.1): 6 Tier 1 + 8 Tier 2 + 11 Tier 3.
  // tier values mirror the DB column; sort_order is per-tier display order.
  // icon_name is left out of new rows — Phase D.4.1 lookups happen by slug
  // via getCategoryEmoji() in src/lib/categories.ts.
  const topCategories = await db
    .insert(schema.categories)
    .values([
      // Tier 1 — featured on home page. search_aliases (Phase D.7.2) hold
      // common buyer terms; lookup is JSONB array containment, lowercased.
      { name: "Fashion & Apparel", slug: "fashion", tier: 1, sort_order: 1, icon_name: "shirt", search_aliases: ["fashion", "clothes", "clothing", "dress", "wear", "outfit", "apparel", "style"] },
      // Phase D.7.3.1: stripped brand / model names — those should match
      // via title/description, not broaden a search to a whole category.
      // Aliases here are category-level synonyms only.
      { name: "Mobile Phones & Tablets", slug: "mobile-phones-tablets", tier: 1, sort_order: 2, icon_name: "smartphone", search_aliases: [
        "phone", "phones", "mobile", "smartphone", "tablet", "tablets",
        "android", "ios",
        "earbuds", "airpods", "headphones", "charger", "powerbank",
        "screen protector", "case", "tempered glass", "smartwatch",
      ] },
      { name: "Hair & Wigs", slug: "hair-wigs", tier: 1, sort_order: 3, icon_name: "scissors", search_aliases: [
        "wig", "wigs", "weave", "weavon", "bundle", "bundles",
        "extension", "extensions", "frontal", "closure", "lace", "lace front", "lace closure",
        "hair", "human hair", "synthetic hair", "virgin hair", "raw hair",
        "ponytail", "braid", "braids", "kinky", "curly", "straight",
        "body wave", "deep wave", "loose wave", "water wave", "jerry curl",
        "edge control", "hair cream", "shampoo", "conditioner", "leave-in",
      ] },
      // Phase D.7.5: perfume/fragrance/cologne removed — they now live in
      // their own Tier 2 'perfume-fragrance' category. Beauty aliases
      // expanded with product-type vocabulary that's clearly Beauty rather
      // than Fragrance (lipstick, mascara, foundation, soap, body wash).
      { name: "Beauty & Personal Care", slug: "beauty", tier: 1, sort_order: 4, icon_name: "sparkles", search_aliases: [
        "beauty", "skincare", "cosmetic", "makeup", "lotion", "cream",
        "soap", "body wash", "shampoo", "conditioner",
        "lipstick", "mascara", "foundation", "concealer",
        "moisturizer", "serum", "facewash", "exfoliator",
      ] },
      { name: "Electronics & Gadgets", slug: "electronics", tier: 1, sort_order: 5, icon_name: "cpu", search_aliases: ["electronics", "electronic", "tv", "television", "gaming", "speaker", "audio", "solar", "console", "playstation", "xbox"] },
      { name: "Home & Furniture", slug: "home-living", tier: 1, sort_order: 6, icon_name: "home", search_aliases: ["furniture", "home", "kitchen", "appliance", "decor", "fridge", "freezer", "cooker", "microwave"] },

      // Tier 2 — in main nav, not on hero (9 parents post-D.7.4).
      // sort_order values mirror the live DB exactly (7-15 range) so the
      // seed is a faithful source-of-truth, not a sequence-clean rewrite.
      { name: "Health & Wellness", slug: "health", tier: 2, sort_order: 7, icon_name: "heart-pulse", search_aliases: ["health", "fitness", "supplement", "vitamin", "medicine", "wellness", "exercise", "workout"] },
      { name: "Baby & Kids", slug: "baby-kids", tier: 2, sort_order: 8, icon_name: "baby", search_aliases: ["baby", "kids", "children", "toy", "stroller", "diaper", "infant"] },
      // Phase D.7.4: food-beverages split into Foodstuff & Groceries
      // (Nigerian retail vocabulary) and Drinks & Beverages.
      { name: "Foodstuff & Groceries", slug: "foodstuff", tier: 2, sort_order: 9, search_aliases: [
        "foodstuff", "food", "groceries", "grocery", "raw food",
        "rice", "beans", "garri", "yam", "cassava", "semovita", "flour",
        "oil", "palm oil", "vegetable oil", "olive oil", "groundnut oil",
        "pepper", "spice", "spices", "seasoning",
        "tomato", "onion", "plantain",
        "frozen", "snack", "snacks", "biscuit", "bread", "pasta",
        "baby food", "formula", "cereal", "cereals",
      ] },
      // Phase D.7.3.1: category-level synonyms only — no brand/model names.
      { name: "Automotive", slug: "vehicles", tier: 2, sort_order: 10, icon_name: "car", search_aliases: [
        "car", "cars", "vehicle", "vehicles", "auto", "automobile", "motor",
        "tokunbo", "fairly used", "foreign used", "naija used", "nigerian used", "uk used",
        "sedan", "suv", "pickup", "truck", "van", "bus", "coupe", "wagon", "minivan", "minibus",
        "keke", "keke napep", "tricycle", "three-wheeler", "three wheeler",
        "motorcycle", "bike", "okada", "scooter",
      ] },
      // Promoted from Tier 3 in Phase D.4.1
      { name: "Property", slug: "property", tier: 2, sort_order: 11, search_aliases: ["property", "house", "apartment", "rent", "land", "real estate", "flat", "duplex", "bungalow"] },
      { name: "Sports & Fitness", slug: "sports", tier: 2, sort_order: 12, search_aliases: ["sport", "sports", "gym", "fitness", "equipment", "exercise", "football", "basketball"] },
      // New Tier 2 parents in Phase D.4.1
      // Phase D.7.3.1: stripped specific brands/model lines (HP, Dell, Lenovo,
      // ThinkPad, Pavilion, etc.). macbook / imac stay because buyers use them
      // generically to mean 'Apple laptop / desktop' rather than as a brand.
      { name: "Computer & Accessories", slug: "computer-accessories", tier: 2, sort_order: 13, search_aliases: [
        "computer", "laptop", "desktop", "pc", "monitor", "keyboard", "mouse",
        "macbook", "imac",
        "windows", "macos", "chromebook", "gaming laptop",
        "ssd", "hdd", "hard drive", "ram", "memory", "graphics card", "gpu", "cpu", "processor",
      ] },
      { name: "Travel & Luggage", slug: "travel-luggage", tier: 2, sort_order: 14, search_aliases: ["travel", "luggage", "suitcase", "backpack", "bag"] },
      { name: "Drinks & Beverages", slug: "drinks", tier: 2, sort_order: 15, search_aliases: [
        "drink", "drinks", "beverage", "beverages",
        "water", "sachet water", "bottled water", "sparkling water",
        "juice", "juices", "smoothie",
        "soda", "soft drink", "cola",
        "alcohol", "wine", "red wine", "white wine", "champagne", "sparkling",
        "beer", "spirits", "vodka", "gin", "whisky", "whiskey", "brandy", "rum",
        "coffee", "tea", "herbal tea", "energy drink",
      ] },
      // Phase D.7.5: standalone Tier 2 (matches Jiji/Jumia conventions).
      // 'oud' / 'agarwood' / 'oriental' included as scent-descriptive
      // aliases — Nigerian usage treats them as scent categories, not
      // brand identifiers (refinement of the D.7.3.1 alias-purity rule).
      { name: "Perfume & Fragrance", slug: "perfume-fragrance", tier: 2, sort_order: 16, search_aliases: [
        "perfume", "perfumes", "fragrance", "fragrances", "scent", "scents",
        "cologne", "eau de toilette", "edt", "eau de parfum", "edp",
        "body spray", "body mist", "body perfume",
        "oud", "agarwood", "oriental", "arabian oud",
        "deodorant", "deodorants", "antiperspirant",
        "car perfume", "perfume oil",
        "mens fragrance", "womens fragrance", "unisex perfume",
      ] },

      // Tier 3 — "more categories" drawer (11 parents post-D.4.1)
      { name: "Services", slug: "services", tier: 3, sort_order: 1, icon_name: "wrench" },
      { name: "Books & Media", slug: "books-media", tier: 3, sort_order: 2, icon_name: "book-open" },
      { name: "Pets", slug: "pets", tier: 3, sort_order: 3, icon_name: "paw-print" },
      { name: "Industrial & Business", slug: "industrial", tier: 3, sort_order: 4, icon_name: "factory" },
      // Phase D.4.1 additions
      { name: "Office Supplies & Equipment", slug: "office-supplies", tier: 3, sort_order: 5 },
      { name: "Tools & Hardware", slug: "tools-hardware", tier: 3, sort_order: 6 },
      { name: "Garden & Outdoor", slug: "garden-outdoor", tier: 3, sort_order: 7 },
      { name: "Musical Instruments", slug: "musical-instruments", tier: 3, sort_order: 8 },
      { name: "Arts & Crafts", slug: "arts-crafts", tier: 3, sort_order: 9 },
      { name: "Photography Equipment", slug: "photography-equipment", tier: 3, sort_order: 10 },
      { name: "Religious Items", slug: "religious-items", tier: 3, sort_order: 11 },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${topCategories.length} top-level categories (Tier 1-3)`);

  const fashion = topCategories.find((c) => c.slug === "fashion");
  const mobile = topCategories.find((c) => c.slug === "mobile-phones-tablets");
  const hair = topCategories.find((c) => c.slug === "hair-wigs");
  const electronics = topCategories.find((c) => c.slug === "electronics");
  const compAcc = topCategories.find((c) => c.slug === "computer-accessories");
  const travel = topCategories.find((c) => c.slug === "travel-luggage");
  const vehicles = topCategories.find((c) => c.slug === "vehicles");
  const foodstuff = topCategories.find((c) => c.slug === "foodstuff");
  const drinks = topCategories.find((c) => c.slug === "drinks");
  const perfume = topCategories.find((c) => c.slug === "perfume-fragrance");

  if (
    fashion &&
    mobile &&
    hair &&
    electronics &&
    compAcc &&
    travel &&
    vehicles &&
    foodstuff &&
    drinks &&
    perfume
  ) {
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

        // Electronics & Gadgets — 1 sub (Phase D.4.1 moved Laptops out)
        { name: "Accessories", slug: "electronics-accessories", parent_id: electronics.id, sort_order: 1 },

        // Computer & Accessories subs (6, Phase D.4.1)
        { name: "Laptops", slug: "laptops", parent_id: compAcc.id, sort_order: 1 },
        { name: "Desktops & Workstations", slug: "desktops-workstations", parent_id: compAcc.id, sort_order: 2 },
        { name: "Monitors", slug: "monitors", parent_id: compAcc.id, sort_order: 3 },
        { name: "Keyboards & Mice", slug: "keyboards-mice", parent_id: compAcc.id, sort_order: 4 },
        { name: "Storage & Drives", slug: "storage-drives", parent_id: compAcc.id, sort_order: 5 },
        { name: "Computer Accessories", slug: "computer-accessories-misc", parent_id: compAcc.id, sort_order: 6 },

        // Travel & Luggage subs (3, Phase D.4.1)
        { name: "Suitcases", slug: "suitcases", parent_id: travel.id, sort_order: 1 },
        { name: "Backpacks & Travel Bags", slug: "backpacks-bags", parent_id: travel.id, sort_order: 2 },
        { name: "Travel Accessories", slug: "travel-accessories", parent_id: travel.id, sort_order: 3 },

        // Automotive subs (4). cars/motorcycles/vehicle-parts existed in live
        // DB before the seed knew about them — backfilling here so a fresh
        // env matches. Tricycles & Keke added in Phase D.7.3.
        { name: "Cars", slug: "cars", parent_id: vehicles.id, sort_order: 1 },
        { name: "Motorcycles", slug: "motorcycles", parent_id: vehicles.id, sort_order: 2 },
        { name: "Parts & Accessories", slug: "vehicle-parts", parent_id: vehicles.id, sort_order: 3 },
        { name: "Tricycles & Keke", slug: "tricycles", parent_id: vehicles.id, sort_order: 4 },

        // Foodstuff & Groceries subs (10, Phase D.7.4)
        { name: "Grains & Rice", slug: "grains-rice", parent_id: foodstuff.id, sort_order: 1 },
        { name: "Spices & Seasonings", slug: "spices-seasonings", parent_id: foodstuff.id, sort_order: 2 },
        { name: "Cooking Oils", slug: "cooking-oils", parent_id: foodstuff.id, sort_order: 3 },
        { name: "Beans & Legumes", slug: "beans-legumes", parent_id: foodstuff.id, sort_order: 4 },
        { name: "Tubers & Flour", slug: "tubers-flour", parent_id: foodstuff.id, sort_order: 5 },
        { name: "Fresh Produce", slug: "fresh-produce", parent_id: foodstuff.id, sort_order: 6 },
        { name: "Frozen Foods", slug: "frozen-foods", parent_id: foodstuff.id, sort_order: 7 },
        { name: "Packaged & Bakery", slug: "packaged-bakery", parent_id: foodstuff.id, sort_order: 8 },
        { name: "Snacks & Confectionery", slug: "snacks-confectionery", parent_id: foodstuff.id, sort_order: 9 },
        { name: "Baby Food", slug: "baby-food", parent_id: foodstuff.id, sort_order: 10 },

        // Drinks & Beverages subs (7, Phase D.7.4)
        { name: "Alcohol & Spirits", slug: "alcohol-spirits", parent_id: drinks.id, sort_order: 1 },
        { name: "Wine", slug: "wine", parent_id: drinks.id, sort_order: 2 },
        { name: "Beer", slug: "beer", parent_id: drinks.id, sort_order: 3 },
        { name: "Soft Drinks", slug: "soft-drinks", parent_id: drinks.id, sort_order: 4 },
        { name: "Juices", slug: "juices", parent_id: drinks.id, sort_order: 5 },
        { name: "Water", slug: "water", parent_id: drinks.id, sort_order: 6 },
        { name: "Coffee & Tea", slug: "coffee-tea", parent_id: drinks.id, sort_order: 7 },

        // Perfume & Fragrance subs (8, Phase D.7.5)
        { name: "Men's Perfume", slug: "perfume-men", parent_id: perfume.id, sort_order: 1 },
        { name: "Women's Perfume", slug: "perfume-women", parent_id: perfume.id, sort_order: 2 },
        { name: "Unisex Perfume", slug: "perfume-unisex", parent_id: perfume.id, sort_order: 3 },
        { name: "Arabian / Oud Perfume", slug: "perfume-oud", parent_id: perfume.id, sort_order: 4 },
        { name: "Body Sprays", slug: "body-sprays", parent_id: perfume.id, sort_order: 5 },
        { name: "Perfume Oils", slug: "perfume-oils", parent_id: perfume.id, sort_order: 6 },
        { name: "Deodorants & Antiperspirants", slug: "deodorants", parent_id: perfume.id, sort_order: 7 },
        { name: "Car Perfumes & Fresheners", slug: "car-perfumes", parent_id: perfume.id, sort_order: 8 },
      ])
      .onConflictDoNothing();
    console.log("  ✓ sub-categories for Fashion, Mobile, Hair, Electronics, Computer & Accessories, Travel & Luggage, Automotive, Foodstuff, Drinks, Perfume & Fragrance");
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
