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
      businesses ( id, business_name, description, owner_id ),
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

  // Signed URLs for private bucket access. Service role bypasses RLS.
  const adminClient = createAdminClient();
  const { data: idDocSigned } = await adminClient.storage
    .from("verification-id-documents")
    .createSignedUrl(verification.id_document_path, SIGNED_URL_TTL_SECONDS);
  const { data: selfieSigned } = verification.selfie_path
    ? await adminClient.storage
        .from("verification-selfies")
        .createSignedUrl(verification.selfie_path, SIGNED_URL_TTL_SECONDS)
    : { data: null };

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
                <dd className="text-ink">{business?.business_name ?? "—"}</dd>
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
