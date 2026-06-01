import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/layout";
import { Badge, Card } from "@/components/ui";
import { ReviewActions } from "./ReviewActions";

export const runtime = "edge";

const SIGNED_URL_TTL_SECONDS = 3600;

export default async function VerificationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/admin/verifications/${params.id}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  // Implicit FK resolution for the address state embed. The constraint
  // name route is fragile here because seller_verifications has FKs from
  // two sources: Drizzle migration (business_id, reviewed_by — both use
  // the `_fk` suffix convention) AND P.1's raw ALTER TABLE which added
  // the address_state_id FK with PostgreSQL's default `_fkey` suffix.
  // Implicit resolution works regardless and survives future migrations
  // that might rename constraints. (Phase C.5.6.1 fix to K-008's
  // "always use explicit FK name" guidance — explicit is fine when you
  // know the name, but unambiguous column->table mappings can rely on
  // PostgREST's auto-resolution.)
  const { data: verification } = await supabase
    .from("seller_verifications")
    .select(
      `
      id, legal_first_name, legal_last_name,
      address_line_1, address_line_2, city,
      nin, id_document_type, id_document_path, selfie_path,
      status, submitted_at, reviewed_at, rejection_reason,
      businesses (
        id, business_name, slug, description, owner_id,
        seller_whatsapp, seller_whatsapp_verified_at, referred_by_name,
        profiles ( display_name, phone, user_type, created_at )
      ),
      nigerian_states ( name )
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!verification) notFound();

  const business = Array.isArray(verification.businesses)
    ? verification.businesses[0]
    : verification.businesses;
  const state = Array.isArray(verification.nigerian_states)
    ? verification.nigerian_states[0]
    : verification.nigerian_states;

  // Feature R: owner profile nested under the businesses embed via the
  // businesses.owner_id -> profiles.id FK. Extracted here so the
  // Registration details panel renders without further round-trips.
  // PostgREST returns the embed shape based on cardinality — supabase-js
  // infers it as an array; runtime can occasionally hand back a single
  // object, so we tolerate both.
  const ownerProfileRaw = (
    business as unknown as { profiles?: Record<string, unknown> | Record<string, unknown>[] } | null
  )?.profiles;
  const ownerProfile: Record<string, unknown> | null = Array.isArray(
    ownerProfileRaw,
  )
    ? (ownerProfileRaw[0] ?? null)
    : (ownerProfileRaw ?? null);

  // Feature R: three admin-context lookups run in parallel — signed URLs
  // for the private storage buckets, plus auth.users lookup for the
  // registration email. Service role bypasses RLS on all three. Email is
  // read in this server component only and rendered server-side; it is
  // NEVER passed as a prop into a client component (ReviewActions below
  // receives only verificationId).
  const adminClient = createAdminClient();
  const [
    { data: idDocSigned },
    { data: selfieSigned },
    { data: ownerAuth },
  ] = await Promise.all([
    adminClient.storage
      .from("verification-id-documents")
      .createSignedUrl(verification.id_document_path, SIGNED_URL_TTL_SECONDS),
    verification.selfie_path
      ? adminClient.storage
          .from("verification-selfies")
          .createSignedUrl(verification.selfie_path, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: null }),
    business?.owner_id
      ? adminClient.auth.admin.getUserById(business.owner_id)
      : Promise.resolve({ data: { user: null } }),
  ]);
  const ownerEmail = ownerAuth?.user?.email ?? null;

  const idDocIsPdf = verification.id_document_path.toLowerCase().endsWith(".pdf");

  return (
    <Container>
      <div className="py-8 sm:py-12 max-w-4xl mx-auto">
        <div className="mb-4 text-sm text-ink-600">
          <Link href="/admin/verifications" className="hover:text-ink">
            ← Queue
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-medium text-ink">
            {verification.legal_first_name} {verification.legal_last_name}
          </h1>
          {verification.status === "pending" && (
            <Badge variant="warning">Pending</Badge>
          )}
          {verification.status === "verified" && (
            <Badge variant="verified">Verified</Badge>
          )}
          {verification.status === "rejected" && (
            <Badge variant="danger">Rejected</Badge>
          )}
        </div>
        <p className="text-sm text-ink-600 mb-8">
          Submitted {new Date(verification.submitted_at).toLocaleString("en-NG")}
        </p>

        {/* Feature R: read-only registration details panel. Sibling above
            the existing two-column grid. All fields render server-side;
            no email/PII crosses into a client component. */}
        <Card className="mb-6">
          <h2 className="text-sm font-medium text-ink mb-3">
            Registration details
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-ink-600 text-xs">Display name</dt>
              <dd className="text-ink">
                {(ownerProfile?.display_name as string | undefined) ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600 text-xs">Email</dt>
              <dd className="text-ink break-all">{ownerEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-600 text-xs">Profile phone</dt>
              <dd className="text-ink font-mono">
                {ownerProfile?.phone
                  ? `+${ownerProfile.phone as string}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600 text-xs">Business WhatsApp</dt>
              <dd className="text-ink font-mono">
                {business?.seller_whatsapp
                  ? `+${business.seller_whatsapp}`
                  : "Not set / uses profile phone"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600 text-xs">WhatsApp status</dt>
              <dd className="text-ink">
                {business?.seller_whatsapp_verified_at
                  ? `Verified ${new Date(
                      business.seller_whatsapp_verified_at,
                    ).toLocaleDateString("en-NG", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}`
                  : "Unverified"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-600 text-xs">User type</dt>
              <dd className="text-ink">
                {(ownerProfile?.user_type as string | undefined) ?? "—"}
              </dd>
            </div>
            {/* Feature U slice 1 — conditional "Referred by" row. Renders
                only when the seller entered a referrer name at signup.
                Admin-only surface; never rendered on public pages. */}
            {business?.referred_by_name && (
              <div className="sm:col-span-2">
                <dt className="text-ink-600 text-xs">Referred by</dt>
                <dd className="text-ink">
                  {business.referred_by_name as string}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-ink-600 text-xs">Account created</dt>
              <dd className="text-ink">
                {ownerProfile?.created_at
                  ? new Date(
                      ownerProfile.created_at as string,
                    ).toLocaleString("en-NG")
                  : "—"}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <h2 className="text-sm font-medium text-ink mb-3">Identity</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Legal name</dt>
                <dd className="text-ink">
                  {verification.legal_first_name} {verification.legal_last_name}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">NIN</dt>
                <dd className="text-ink font-mono">{verification.nin}</dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">ID type</dt>
                <dd className="text-ink">
                  {verification.id_document_type?.replace(/_/g, " ")}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-ink mb-3">Address</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Line 1</dt>
                <dd className="text-ink">{verification.address_line_1}</dd>
              </div>
              {verification.address_line_2 && (
                <div>
                  <dt className="text-ink-600 text-xs">Line 2</dt>
                  <dd className="text-ink">{verification.address_line_2}</dd>
                </div>
              )}
              <div>
                <dt className="text-ink-600 text-xs">City</dt>
                <dd className="text-ink">{verification.city}</dd>
              </div>
              <div>
                <dt className="text-ink-600 text-xs">State</dt>
                <dd className="text-ink">{state?.name ?? "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-ink mb-3">Business</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-ink-600 text-xs">Name</dt>
                <dd className="text-ink">
                  {business?.business_name ? (
                    verification.status === "verified" && business?.slug ? (
                      <Link
                        href={`/sellers/${business.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-700 hover:text-teal-900 underline underline-offset-2"
                      >
                        {business.business_name}
                      </Link>
                    ) : (
                      business.business_name
                    )
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {business?.description && (
                <div>
                  <dt className="text-ink-600 text-xs">Description</dt>
                  <dd className="text-ink whitespace-pre-line">
                    {business.description}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {selfieSigned?.signedUrl && (
            <Card padding="none" className="overflow-hidden">
              <div className="p-4 pb-2">
                <h2 className="text-sm font-medium text-ink">Selfie</h2>
              </div>
              {/* Mobile fix: aspect-square has known iOS Safari quirks in grid
                  contexts (can collapse to zero height). Use explicit viewport-
                  relative max-height instead so the image always has somewhere
                  to render. loading="lazy" + decoding="async" let mobile
                  browsers decode large phone-photo JPGs incrementally. */}
              <div className="bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selfieSigned.signedUrl}
                  alt="Seller selfie"
                  loading="lazy"
                  decoding="async"
                  className="block w-full max-h-[70vh] sm:max-h-[500px] object-contain"
                />
              </div>
              <div className="p-3 border-t border-neutral-200 text-right">
                <a
                  href={selfieSigned.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-700 hover:text-teal-900 font-medium"
                >
                  Open full size →
                </a>
              </div>
            </Card>
          )}
        </div>

        <Card padding="none" className="overflow-hidden mb-8">
          <div className="p-4 pb-2">
            <h2 className="text-sm font-medium text-ink">ID document</h2>
          </div>
          <div className="bg-neutral-100">
            {idDocSigned?.signedUrl && idDocIsPdf ? (
              // Mobile fix: iOS Safari + most mobile browsers won't render
              // PDFs inside an iframe — show a link that opens in the device's
              // native PDF viewer instead. Works on desktop too.
              <div className="p-8 text-center">
                <p className="text-sm text-ink-600 mb-4">
                  PDF document — open in your device&apos;s PDF viewer.
                </p>
                <a
                  href={idDocSigned.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
                >
                  Open ID document (PDF) →
                </a>
              </div>
            ) : idDocSigned?.signedUrl ? (
              // Mobile fix: viewport-relative max-height + lazy/async decode
              // so large phone-photo JPGs render reliably on iOS Safari and
              // Android Chrome. Same w-full + object-contain shape as before.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={idDocSigned.signedUrl}
                alt="ID document"
                loading="lazy"
                decoding="async"
                className="block w-full max-h-[80vh] sm:max-h-[600px] object-contain"
              />
            ) : (
              <p className="p-8 text-center text-sm text-ink-600">
                Couldn&apos;t load ID document.
              </p>
            )}
          </div>
          {idDocSigned?.signedUrl && !idDocIsPdf && (
            <div className="p-3 border-t border-neutral-200 text-right">
              <a
                href={idDocSigned.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-700 hover:text-teal-900 font-medium"
              >
                Open full size →
              </a>
            </div>
          )}
        </Card>

        {verification.status === "pending" && (
          <ReviewActions verificationId={verification.id} />
        )}

        {verification.status === "rejected" && verification.rejection_reason && (
          <Card className="bg-danger-bg border-danger/30">
            <h3 className="text-sm font-medium text-danger-text mb-1">
              Rejection reason
            </h3>
            <p className="text-sm text-danger-text">
              {verification.rejection_reason}
            </p>
          </Card>
        )}
      </div>
    </Container>
  );
}
