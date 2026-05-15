import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/layout";
import { Card } from "@/components/ui";
import { BecomeSellerForm } from "./BecomeSellerForm";

export const runtime = "edge";

export default async function SellPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/sell");

  const { data: existingBiz } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (existingBiz) redirect("/dashboard/listings");

  const { data: states } = await supabase
    .from("nigerian_states")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <Container size="narrow">
      <div className="py-12 sm:py-16 max-w-xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-medium text-ink mb-2 text-center">
          Sell on ShowMePrice
        </h1>
        <p className="text-sm text-ink-600 text-center mb-8">
          Tell us about your business. You can post listings right away — verification
          (ID and bank account) happens separately so buyers know you&apos;re real.
        </p>
        <Card>
          <BecomeSellerForm states={states ?? []} />
        </Card>
        <p className="mt-6 text-xs text-ink-400 text-center">
          By creating a seller account, you agree to honour the prices you post and
          respond to buyer messages within 48 hours.
        </p>
      </div>
    </Container>
  );
}
