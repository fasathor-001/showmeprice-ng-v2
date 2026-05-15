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

  // Use Drizzle's explicit FK constraint name for the address state embed
  // (per the K-008 lesson: PostgREST resolves embeds by constraint name and
  // Drizzle's naming is `<table>_<column>_<reftable>_<refcolumn>_fk`).
  const { data: verification } = await supabase
    .from("seller_verifications")
    .select(
      `
      id, legal_first_name, legal_last_name,
      address_line_1, address_line_2, city,
      nin, id_document_type, id_document_path, selfie_path,
      status, submitted_at, reviewed_at, rejection_reason,
      businesses ( id, business_name, description, owner_id ),
      nigerian_states!seller_verifications_address_state_id_nigerian_states_id_fk ( name )
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
            <Badge variant="verified">Approved</Badge>
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
              <div className="bg-neutral-100 aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selfieSigned.signedUrl}
                  alt="Seller selfie"
                  className="w-full h-full object-contain"
                />
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
              <iframe
                src={idDocSigned.signedUrl}
                className="w-full h-[600px]"
                title="ID document"
              />
            ) : idDocSigned?.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={idDocSigned.signedUrl}
                alt="ID document"
                className="w-full max-h-[600px] object-contain"
              />
            ) : (
              <p className="p-8 text-center text-sm text-ink-600">
                Couldn&apos;t load ID document.
              </p>
            )}
          </div>
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
