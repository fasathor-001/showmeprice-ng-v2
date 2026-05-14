"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeNigerianWhatsApp,
  validateSignUpForm,
  hasErrors,
  type ValidationErrors,
} from "@/lib/auth";

export interface ActionResult {
  errors?: ValidationErrors & { _form?: string };
  success?: boolean;
}

export async function signUpAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const whatsappNumber = String(formData.get("whatsappNumber") ?? "").trim();

  // Defense in depth: re-run client-side validation server-side.
  const errors = validateSignUpForm({ email, password, displayName, whatsappNumber });
  if (hasErrors(errors)) return { errors };

  const normalized = normalizeNigerianWhatsApp(whatsappNumber);
  if (!normalized) return { errors: { whatsappNumber: "Invalid WhatsApp number" } };

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Keys must match handle_new_user trigger's reads in 0000_*.sql:
      //   raw_user_meta_data->>'display_name'
      //   raw_user_meta_data->>'whatsapp_number'
      data: {
        display_name: displayName,
        whatsapp_number: normalized,
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { errors: { email: "An account with this email already exists" } };
    }
    if (error.message.toLowerCase().includes("rate")) {
      return {
        errors: { _form: "Too many attempts. Please wait a moment and try again." },
      };
    }
    return { errors: { _form: error.message } };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email) return { errors: { email: "Email is required" } };
  if (!password) return { errors: { password: "Password is required" } };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("invalid login credentials")) {
      return { errors: { _form: "Email or password is incorrect" } };
    }
    return { errors: { _form: error.message } };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) return { errors: { email: "Email is required" } };

  const supabase = createClient();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://showmeprice-ng-v2.pages.dev";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery&next=/dashboard`,
  });

  // Don't reveal whether the email is in the system (privacy + anti-enumeration).
  if (error?.message.toLowerCase().includes("rate")) {
    return {
      errors: { _form: "Too many attempts. Please wait a moment and try again." },
    };
  }
  if (error) {
    return { errors: { _form: error.message } };
  }

  return { success: true };
}

export async function updatePasswordAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password) return { errors: { password: "Password is required" } };
  if (password.length < 8)
    return { errors: { password: "Password must be at least 8 characters" } };
  if (password.length > 72)
    return { errors: { password: "Password is too long (max 72 characters)" } };
  if (password !== confirmPassword) {
    return { errors: { _form: "Passwords don't match" } };
  }

  const supabase = createClient();

  // Defense in depth: confirm an active session exists before updating.
  // Without this, an unauthenticated POST surfaces a Supabase error instead
  // of a clean message about expired recovery state.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      errors: {
        _form: "Your session has expired. Please request a new reset link.",
      },
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.message.toLowerCase().includes("same password")) {
      return {
        errors: {
          password: "New password must be different from your current password",
        },
      };
    }
    if (error.message.toLowerCase().includes("rate")) {
      return {
        errors: { _form: "Too many attempts. Please wait a moment and try again." },
      };
    }
    return { errors: { _form: error.message } };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard?toast=password-updated");
}
