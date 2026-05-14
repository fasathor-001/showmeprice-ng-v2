import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function HomePage() {
  const supabase = createClient();

  const [statesResult, categoriesResult] = await Promise.all([
    supabase.from("nigerian_states").select("*", { count: "exact", head: true }),
    supabase.from("categories").select("*", { count: "exact", head: true }),
  ]);

  const stateCount = statesResult.count ?? 0;
  const categoryCount = categoriesResult.count ?? 0;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-ink">
          ShowMePrice<span className="text-teal">.ng</span>
        </h1>
        <p className="mt-2 text-sm text-neutral-500">v2 foundation — kickoff complete</p>
        <div className="mt-8 text-xs text-neutral-400">
          DB: {stateCount} states · {categoryCount} categories
        </div>
      </div>
    </main>
  );
}
