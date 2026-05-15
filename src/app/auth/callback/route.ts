import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

type RecoveryType =
  | "recovery"
  | "email"
  | "invite"
  | "magiclink"
  | "signup"
  | "email_change";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as RecoveryType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = createClient();

  // After session exchange, sellers with an un-verified business should land
  // on /sell/verify rather than /dashboard (overrides `next`, except for
  // recovery which always routes to /reset-password).
  //
  // For seller signups (email confirmation ON, D-023), the business row
  // doesn't exist yet at this point — signUpAction stashed the data in
  // raw_user_meta_data because signUp returned no session. Now that we
  // have a session from the confirm-email exchange, we promote the
  // profile and create the business under the authenticated context.
  async function postAuthRedirect(): Promise<NextResponse> {
    if (type === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const metadata = (user.user_metadata ?? {}) as {
        user_type?: string;
        business_name?: string;
        business_state_id?: string;
      };
      if (
        metadata.user_type === "seller" &&
        metadata.business_name &&
        metadata.business_state_id
      ) {
        const { data: existingBiz } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!existingBiz) {
          await supabase
            .from("profiles")
            .update({ user_type: "seller" })
            .eq("id", user.id);
          const { error: bizError } = await supabase.from("businesses").insert({
            owner_id: user.id,
            business_name: metadata.business_name,
            state_id: metadata.business_state_id,
          });
          if (bizError) {
            // Best-effort: route to /sell so they can complete via
            // becomeSellerForm with a clear toast.
            return NextResponse.redirect(
              `${origin}/sell?toast=signup-business-failed`
            );
          }
        }
      }

      const { data: business } = await supabase
        .from("businesses")
        .select("verification_status")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (business && business.verification_status !== "verified") {
        return NextResponse.redirect(`${origin}/sell/verify`);
      }
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Branch 1: token_hash flow (email links — password recovery, signup confirmation).
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return postAuthRedirect();
    }
  }

  // Branch 2: code flow (OAuth / PKCE-style callbacks).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return postAuthRedirect();
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=callback-failed`);
}
