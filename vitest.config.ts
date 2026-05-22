import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Targeted test config (Stage 2.B Commit 1). Scoped to the high-consequence
// messaging safety-filter logic only — NOT a broader test harness (per the
// banked decision: existing gate is typecheck + pnpm build + manual/prod smoke).
// The `@` alias is needed because filters.ts top-level-imports @/lib/supabase/admin
// (only its definition is loaded; not called in the pure unit under test).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
