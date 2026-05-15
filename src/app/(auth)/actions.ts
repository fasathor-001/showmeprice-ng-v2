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
import {
  parseNairaInputToKobo,
  validateListingForm,
  hasErrors as listingHasErrors,
  generateListingSlug,
  type ListingValidationErrors,
} from "@/lib/listings";

export interface ActionResult {
  errors?: ValidationErrors & {
    _form?: string;
    businessName?: string;
    businessStateId?: string;
  };
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
  const userType = String(formData.get("userType") ?? "buyer");
  const businessName = String(formData.get("businessName") ?? "").trim();
  const businessStateId = String(formData.get("businessStateId") ?? "");

  // Defense in depth: re-run client-side validation server-side.
  const errors = validateSignUpForm({ email, password, displayName, whatsappNumber }) as ActionResult["errors"];
  if (userType !== "buyer" && userType !== "seller") {
    return { errors: { _form: "Invalid account type" } };
  }
  if (userType === "seller") {
    if (!businessName) errors!.businessName = "Business name is required";
    else if (businessName.length < 2)
      errors!.businessName = "Business name must be at least 2 characters";
    else if (businessName.length > 80)
      errors!.businessName = "Business name is too long (max 80)";
    if (!businessStateId) errors!.businessStateId = "State is required";
  }
  if (hasErrors(errors as ValidationErrors) || errors?.businessName || errors?.businessStateId) {
    return { errors };
  }

  const normalized = normalizeNigerianWhatsApp(whatsappNumber);
  if (!normalized) return { errors: { whatsappNumber: "Invalid WhatsApp number" } };

  const supabase = createClient();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://showmeprice-ng-v2.pages.dev";

  // With email confirmation ON (D-023), signUp does NOT return a session.
  // Any RLS-protected write here (profile UPDATE, business INSERT) would
  // silently fail because auth.uid() is NULL. Instead, we stash the seller's
  // business info in raw_user_meta_data and create the business after the
  // user clicks the confirmation email — at which point /auth/callback
  // exchanges the token for a session and runs the writes under the
  // authenticated context.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Keys must match handle_new_user trigger's reads:
      //   raw_user_meta_data->>'display_name'
      //   raw_user_meta_data->>'whatsapp_number'
      // user_type / business_name / business_state_id are consumed by
      // /auth/callback after email confirmation; the trigger ignores them.
      data: {
        display_name: displayName,
        whatsapp_number: normalized,
        user_type: userType,
        ...(userType === "seller"
          ? {
              business_name: businessName,
              business_state_id: businessStateId,
            }
          : {}),
      },
      emailRedirectTo: `${origin}/auth/callback`,
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
  redirect(
    `/sign-up/success?type=${userType}&email=${encodeURIComponent(email)}`
  );
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

interface BecomeSellerErrors {
  businessName?: string;
  businessDescription?: string;
  stateId?: string;
  _form?: string;
}

interface BecomeSellerResult {
  errors?: BecomeSellerErrors;
  success?: boolean;
}

export async function becomeSellerAction(
  _prev: BecomeSellerResult | null,
  formData: FormData
): Promise<BecomeSellerResult> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const businessDescription = String(
    formData.get("businessDescription") ?? ""
  ).trim();
  const stateId = String(formData.get("stateId") ?? "");

  const errors: BecomeSellerErrors = {};
  if (!businessName) errors.businessName = "Business name is required";
  else if (businessName.length < 2)
    errors.businessName = "Business name must be at least 2 characters";
  else if (businessName.length > 80)
    errors.businessName = "Business name is too long (max 80)";

  if (!businessDescription) errors.businessDescription = "Description is required";
  else if (businessDescription.length < 20)
    errors.businessDescription = "Description must be at least 20 characters";
  else if (businessDescription.length > 500)
    errors.businessDescription = "Description is too long (max 500)";

  if (!stateId) errors.stateId = "State is required";

  if (Object.values(errors).some((v) => v)) return { errors };

  let shouldRedirect = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { errors: { _form: "You must be signed in to become a seller" } };
    }

    // Defense in depth: page also checks this and redirects.
    const { data: existingBiz } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (existingBiz) {
      return { errors: { _form: "You already have a seller account" } };
    }

    // verification_status defaults to 'unsubmitted' per ACTUAL_SCHEMA.md (post P.1).
    // Setting it to 'pending' here was wrong: 'pending' means "we have a submission
    // under review," but a brand-new business has no submission yet. The seller's
    // /sell/verify flow flips both businesses.verification_status and
    // seller_verifications.status through the admin approval path.
    const { error: insertError } = await supabase.from("businesses").insert({
      owner_id: user.id,
      business_name: businessName,
      description: businessDescription,
      state_id: stateId,
    });

    if (insertError) {
      return { errors: { _form: insertError.message } };
    }

    // Surface profile-UPDATE errors instead of swallowing them. A silent failure
    // here was a likely root cause for the C.5.3 production 500 — the business
    // was created but the user_type upgrade rejected somehow, and the
    // unhandled rejection bubbled out of the action.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ user_type: "seller" })
      .eq("id", user.id);
    if (profileError) {
      return {
        errors: {
          _form: `Seller upgrade failed: ${profileError.message}`,
        },
      };
    }

    shouldRedirect = true;
  } catch (e) {
    // redirect() throws NEXT_REDIRECT which must propagate. Anything else
    // is a real exception we want to surface as a form error instead of
    // letting it 500 — that's what triggered the "Application error" /
    // undefined-state crash on the client (C.5.3.1).
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    return {
      errors: {
        _form: `Couldn't create seller account: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
    };
  }

  if (shouldRedirect) {
    revalidatePath("/", "layout");
    redirect("/sell/verify?toast=seller-account-created");
  }
  return {};
}

interface UpdateBusinessErrors {
  businessName?: string;
  businessDescription?: string;
  stateId?: string;
  _form?: string;
}

interface UpdateBusinessResult {
  errors?: UpdateBusinessErrors;
  success?: boolean;
}

export async function updateBusinessAction(
  _prev: UpdateBusinessResult | null,
  formData: FormData
): Promise<UpdateBusinessResult> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const businessDescription = String(
    formData.get("businessDescription") ?? ""
  ).trim();
  const stateId = String(formData.get("stateId") ?? "");

  const errors: UpdateBusinessErrors = {};
  if (!businessName) errors.businessName = "Business name is required";
  else if (businessName.length < 2)
    errors.businessName = "Business name must be at least 2 characters";
  else if (businessName.length > 80)
    errors.businessName = "Business name is too long (max 80)";

  if (businessDescription && businessDescription.length > 500)
    errors.businessDescription = "Description is too long (max 500)";

  if (!stateId) errors.stateId = "State is required";

  if (Object.values(errors).some((v) => v)) return { errors };

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { errors: { _form: "You must be signed in" } };

    // businesses_owner_update RLS allows the owner to update; the
    // businesses_freeze_verification trigger only blocks changes to
    // verification_status — other columns pass through cleanly.
    const { error } = await supabase
      .from("businesses")
      .update({
        business_name: businessName,
        description: businessDescription || null,
        state_id: stateId,
      })
      .eq("owner_id", user.id);

    if (error) return { errors: { _form: error.message } };

    revalidatePath("/sell");
    return { success: true };
  } catch (e) {
    return {
      errors: {
        _form: `Couldn't save business: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
    };
  }
}

interface VerificationErrors {
  legalFirstName?: string;
  legalLastName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  addressStateId?: string;
  nin?: string;
  idDocumentType?: string;
  idDocumentPath?: string;
  selfiePath?: string;
  _form?: string;
}

interface VerificationResult {
  errors?: VerificationErrors;
}

const ID_DOC_TYPES = [
  "nin_slip",
  "drivers_license",
  "voters_card",
  "international_passport",
] as const;

// Per D-035: this action ONLY inserts into seller_verifications. It does
// NOT update businesses.verification_status — Phase A's
// businesses_freeze_verification trigger blocks non-admin writes to that
// column. The seller's dashboard banner derives state from the latest
// seller_verifications row. The admin's approve/reject action (running
// as admin) updates both tables.
export async function submitVerificationAction(
  _prev: VerificationResult | null,
  formData: FormData
): Promise<VerificationResult> {
  const legalFirstName = String(formData.get("legalFirstName") ?? "").trim();
  const legalLastName = String(formData.get("legalLastName") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2Raw = String(formData.get("addressLine2") ?? "").trim();
  const addressLine2 = addressLine2Raw === "" ? null : addressLine2Raw;
  const city = String(formData.get("city") ?? "").trim();
  const addressStateId = String(formData.get("addressStateId") ?? "");
  const nin = String(formData.get("nin") ?? "").trim();
  const idDocumentType = String(formData.get("idDocumentType") ?? "");
  const idDocumentPath = String(formData.get("idDocumentPath") ?? "");
  const selfiePath = String(formData.get("selfiePath") ?? "");

  // Server-side validation. Never log NIN values (NDPR).
  const errors: VerificationErrors = {};
  if (!legalFirstName) errors.legalFirstName = "First name is required";
  else if (legalFirstName.length < 2 || legalFirstName.length > 60)
    errors.legalFirstName = "First name must be 2-60 characters";

  if (!legalLastName) errors.legalLastName = "Last name is required";
  else if (legalLastName.length < 2 || legalLastName.length > 60)
    errors.legalLastName = "Last name must be 2-60 characters";

  if (!addressLine1) errors.addressLine1 = "Address is required";
  else if (addressLine1.length < 5 || addressLine1.length > 200)
    errors.addressLine1 = "Address must be 5-200 characters";

  if (addressLine2 && addressLine2.length > 200)
    errors.addressLine2 = "Address line 2 is too long";

  if (!city) errors.city = "City is required";
  else if (city.length < 2 || city.length > 80)
    errors.city = "City must be 2-80 characters";

  if (!addressStateId) errors.addressStateId = "State is required";

  if (!nin) errors.nin = "NIN is required";
  else if (!/^\d{11}$/.test(nin)) errors.nin = "NIN must be exactly 11 digits";

  if (!idDocumentType) errors.idDocumentType = "Select an ID type";
  else if (
    !ID_DOC_TYPES.includes(idDocumentType as (typeof ID_DOC_TYPES)[number])
  )
    errors.idDocumentType = "Invalid ID type";

  if (!idDocumentPath) errors.idDocumentPath = "Upload your ID document";
  if (!selfiePath) errors.selfiePath = "Upload your selfie";

  if (Object.values(errors).some((v) => v)) return { errors };

  let isResubmission = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { errors: { _form: "You must be signed in" } };

    const { data: business } = await supabase
      .from("businesses")
      .select("id, verification_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!business)
      return { errors: { _form: "You need a seller account first" } };
    if (business.verification_status === "verified") {
      return { errors: { _form: "Your account is already verified" } };
    }

    // Defense in depth: storage RLS already enforces folder-scoping via the
    // verification_*_owner_insert policies (path must start with auth.uid()/),
    // but re-check here in case a future RLS change drifts.
    const expectedFolder = `${user.id}/`;
    if (!idDocumentPath.startsWith(expectedFolder)) {
      return { errors: { _form: "Invalid ID document upload path" } };
    }
    if (!selfiePath.startsWith(expectedFolder)) {
      return { errors: { _form: "Invalid selfie upload path" } };
    }

    // Resubmission detection: any prior row for this business counts. After
    // a rejection, the prior row has status='rejected'; after admin approval
    // (with subsequent re-verification path), 'verified'. Either way it's
    // a re-submission.
    const { data: priorSubmission } = await supabase
      .from("seller_verifications")
      .select("id")
      .eq("business_id", business.id)
      .limit(1)
      .maybeSingle();
    isResubmission = priorSubmission !== null;

    // Banking columns are NOT NULL from Phase A's banking-focused design
    // (K-009 tracks the technical debt). Insert placeholders for now;
    // Phase G will collect real banking info during Pro upgrade.
    const { error: insertError } = await supabase
      .from("seller_verifications")
      .insert({
        business_id: business.id,

        // Banking placeholders (K-009)
        id_document_path: idDocumentPath,
        bank_account_number: "PENDING",
        bank_name: "PENDING",
        bank_account_holder: "PENDING",

        // Identity (Phase C.5)
        legal_first_name: legalFirstName,
        legal_last_name: legalLastName,
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city,
        address_state_id: addressStateId,
        nin,
        id_document_type: idDocumentType as (typeof ID_DOC_TYPES)[number],
        selfie_path: selfiePath,

        status: "pending",
      });

    if (insertError) {
      return { errors: { _form: insertError.message } };
    }
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    return {
      errors: {
        _form: `Couldn't submit verification: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
    };
  }

  revalidatePath("/", "layout");
  // First-vs-resubmission is determined by the destination page reading the
  // seller_verifications row count, so no toast key needed in the URL.
  // (isResubmission is computed above only for potential future use / logs.)
  void isResubmission;
  redirect("/sell/verify/submitted");
}

interface ListingActionResult {
  errors?: ListingValidationErrors;
  success?: boolean;
}

async function getSellerBusiness(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name, verification_status")
    .eq("owner_id", userId)
    .maybeSingle();
  return business;
}

export async function createListingAction(
  _prev: ListingActionResult | null,
  formData: FormData
): Promise<ListingActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceInput = String(formData.get("priceInput") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const stateId = String(formData.get("stateId") ?? "");
  const negotiable = formData.get("negotiable") === "on";

  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const errors = validateListingForm({
    title,
    description,
    priceInput,
    categoryId,
    stateId,
    negotiable,
    imageUrls,
  });
  if (listingHasErrors(errors)) return { errors };

  const priceKobo = parseNairaInputToKobo(priceInput)!;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { errors: { _form: "You must be signed in to create a listing" } };

  const business = await getSellerBusiness(supabase, user.id);
  if (!business) {
    return { errors: { _form: "You need a seller account before posting listings" } };
  }

  const slug = generateListingSlug(title);
  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      business_id: business.id,
      seller_id: user.id,
      slug,
      title,
      description,
      price_kobo: priceKobo,
      currency: "NGN",
      is_negotiable: negotiable,
      category_id: categoryId,
      state_id: stateId,
      status: "active",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (productError || !product) {
    return { errors: { _form: productError?.message ?? "Failed to create listing" } };
  }

  const imageInserts = imageUrls.map((url, idx) => ({
    product_id: product.id,
    storage_path: url,
    position: idx,
  }));
  const { error: imageError } = await supabase
    .from("product_images")
    .insert(imageInserts);
  if (imageError) {
    // Listing created but images failed — log and continue; user can edit to retry images.
    console.error("Failed to attach images", imageError);
  }

  revalidatePath("/", "layout");
  redirect(`/dashboard/listings?toast=listing-created`);
}

export async function updateListingAction(
  productId: string,
  _prev: ListingActionResult | null,
  formData: FormData
): Promise<ListingActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceInput = String(formData.get("priceInput") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const stateId = String(formData.get("stateId") ?? "");
  const negotiable = formData.get("negotiable") === "on";
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const errors = validateListingForm({
    title,
    description,
    priceInput,
    categoryId,
    stateId,
    negotiable,
    imageUrls,
  });
  if (listingHasErrors(errors)) return { errors };

  const priceKobo = parseNairaInputToKobo(priceInput)!;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errors: { _form: "You must be signed in" } };

  const { data: existing } = await supabase
    .from("products")
    .select("seller_id")
    .eq("id", productId)
    .maybeSingle();
  if (!existing) return { errors: { _form: "Listing not found" } };
  if (existing.seller_id !== user.id)
    return { errors: { _form: "You don't own this listing" } };

  const { error: updateError } = await supabase
    .from("products")
    .update({
      title,
      description,
      price_kobo: priceKobo,
      is_negotiable: negotiable,
      category_id: categoryId,
      state_id: stateId,
    })
    .eq("id", productId);

  if (updateError) return { errors: { _form: updateError.message } };

  // Replace images: delete-then-insert is simpler than diffing for Phase C.
  await supabase.from("product_images").delete().eq("product_id", productId);
  const imageInserts = imageUrls.map((url, idx) => ({
    product_id: productId,
    storage_path: url,
    position: idx,
  }));
  await supabase.from("product_images").insert(imageInserts);

  revalidatePath("/", "layout");
  redirect(`/dashboard/listings?toast=listing-updated`);
}

export async function deleteListingAction(formData: FormData): Promise<void> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("products")
    .select("seller_id")
    .eq("id", productId)
    .maybeSingle();
  if (!existing || existing.seller_id !== user.id) return;

  // product_images cascade-deletes via FK in Phase A schema.
  await supabase.from("products").delete().eq("id", productId);

  revalidatePath("/", "layout");
  redirect(`/dashboard/listings?toast=listing-deleted`);
}
