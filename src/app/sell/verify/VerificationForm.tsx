"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ui";
import { submitVerificationAction } from "@/app/(auth)/actions";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

interface State {
  id: string;
  name: string;
}

interface Props {
  states: State[];
  userId: string;
}

const initial = { errors: {} };

const ID_DOC_OPTIONS = [
  { value: "nin_slip", label: "NIN Slip / Card" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "voters_card", label: "Voter's Card (PVC)" },
  { value: "international_passport", label: "International Passport" },
];

const ID_DOC_BUCKET = "verification-id-documents";
const SELFIE_BUCKET = "verification-selfies";

export function VerificationForm({ states, userId }: Props) {
  const [state, formAction] = useFormState(submitVerificationAction, initial);
  const [idDocPath, setIdDocPath] = useState<string>("");
  const [selfiePath, setSelfiePath] = useState<string>("");
  const [uploading, setUploading] = useState<"idDoc" | "selfie" | null>(null);
  const [uploadError, setUploadError] = useState<string>("");

  const supabase = createBrowserSupabase();

  const uploadFile = async (
    file: File,
    bucket: string,
    kind: "idDoc" | "selfie"
  ) => {
    setUploading(kind);
    setUploadError("");
    try {
      const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      // Allow only alphanumeric extension chars; defend against weird uploads.
      const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : "bin";
      const fileName = `${kind}-${Date.now()}.${ext}`;
      const path = `${userId}/${fileName}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) {
        setUploadError(`Upload failed: ${error.message}`);
        return;
      }
      if (kind === "idDoc") setIdDocPath(path);
      else setSelfiePath(path);
    } catch (e) {
      setUploadError(
        `Upload failed: ${e instanceof Error ? e.message : "unknown error"}`
      );
    } finally {
      setUploading(null);
    }
  };

  const handleIdDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, ID_DOC_BUCKET, "idDoc");
  };

  const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, SELFIE_BUCKET, "selfie");
  };

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state?.errors?._form && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {state.errors._form}
        </div>
      )}
      {uploadError && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2.5 rounded-lg"
        >
          {uploadError}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">
          Legal name (as on ID)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="legalFirstName"
              className="block text-xs font-medium text-ink-600 mb-1.5"
            >
              First name
            </label>
            <Input
              id="legalFirstName"
              name="legalFirstName"
              type="text"
              autoComplete="given-name"
              required
              error={state?.errors?.legalFirstName}
            />
          </div>
          <div>
            <label
              htmlFor="legalLastName"
              className="block text-xs font-medium text-ink-600 mb-1.5"
            >
              Last name
            </label>
            <Input
              id="legalLastName"
              name="legalLastName"
              type="text"
              autoComplete="family-name"
              required
              error={state?.errors?.legalLastName}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">
          Residential address
        </legend>
        <div>
          <label
            htmlFor="addressLine1"
            className="block text-xs font-medium text-ink-600 mb-1.5"
          >
            Street address
          </label>
          <Input
            id="addressLine1"
            name="addressLine1"
            type="text"
            autoComplete="address-line1"
            required
            error={state?.errors?.addressLine1}
          />
        </div>
        <div>
          <label
            htmlFor="addressLine2"
            className="block text-xs font-medium text-ink-600 mb-1.5"
          >
            Apartment / Suite (optional)
          </label>
          <Input
            id="addressLine2"
            name="addressLine2"
            type="text"
            autoComplete="address-line2"
            error={state?.errors?.addressLine2}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="city"
              className="block text-xs font-medium text-ink-600 mb-1.5"
            >
              City
            </label>
            <Input
              id="city"
              name="city"
              type="text"
              autoComplete="address-level2"
              required
              error={state?.errors?.city}
            />
          </div>
          <div>
            <label
              htmlFor="addressStateId"
              className="block text-xs font-medium text-ink-600 mb-1.5"
            >
              State
            </label>
            <select
              id="addressStateId"
              name="addressStateId"
              required
              defaultValue=""
              className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
            >
              <option value="" disabled>
                Choose state
              </option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {state?.errors?.addressStateId && (
              <p className="text-xs text-danger mt-1.5">
                {state.errors.addressStateId}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">
          National Identification Number
        </legend>
        <div>
          <label
            htmlFor="nin"
            className="block text-xs font-medium text-ink-600 mb-1.5"
          >
            NIN
          </label>
          <Input
            id="nin"
            name="nin"
            type="text"
            inputMode="numeric"
            pattern="\d{11}"
            required
            placeholder="11 digits"
            error={state?.errors?.nin}
          />
          <p className="text-xs text-ink-600 mt-1.5">
            Your 11-digit NIN. Dial *346# to retrieve it.
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Government ID</legend>
        <div>
          <label
            htmlFor="idDocumentType"
            className="block text-xs font-medium text-ink-600 mb-1.5"
          >
            ID type
          </label>
          <select
            id="idDocumentType"
            name="idDocumentType"
            required
            defaultValue=""
            className="block w-full bg-white border border-neutral-300 rounded-lg text-base text-ink px-3 py-2.5 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400"
          >
            <option value="" disabled>
              Choose ID type
            </option>
            {ID_DOC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {state?.errors?.idDocumentType && (
            <p className="text-xs text-danger mt-1.5">
              {state.errors.idDocumentType}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="idDocUpload"
            className="block text-xs font-medium text-ink-600 mb-1.5"
          >
            Upload ID document
          </label>
          <input
            id="idDocUpload"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleIdDocChange}
            className="block w-full text-sm text-ink-600"
          />
          <input type="hidden" name="idDocumentPath" value={idDocPath} />
          {uploading === "idDoc" && (
            <p className="text-xs text-ink-600 mt-1.5">Uploading…</p>
          )}
          {idDocPath && uploading !== "idDoc" && (
            <p className="text-xs text-verified-text mt-1.5">✓ Uploaded</p>
          )}
          {state?.errors?.idDocumentPath && (
            <p className="text-xs text-danger mt-1.5">
              {state.errors.idDocumentPath}
            </p>
          )}
          <p className="text-xs text-ink-600 mt-1.5">
            Max 10 MB. JPG, PNG, WebP, or PDF.
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Selfie</legend>
        <div>
          <label
            htmlFor="selfieUpload"
            className="block text-xs font-medium text-ink-600 mb-1.5"
          >
            Selfie holding your ID
          </label>
          <input
            id="selfieUpload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSelfieChange}
            className="block w-full text-sm text-ink-600"
          />
          <input type="hidden" name="selfiePath" value={selfiePath} />
          {uploading === "selfie" && (
            <p className="text-xs text-ink-600 mt-1.5">Uploading…</p>
          )}
          {selfiePath && uploading !== "selfie" && (
            <p className="text-xs text-verified-text mt-1.5">✓ Uploaded</p>
          )}
          {state?.errors?.selfiePath && (
            <p className="text-xs text-danger mt-1.5">
              {state.errors.selfiePath}
            </p>
          )}
          <p className="text-xs text-ink-600 mt-1.5">
            A clear photo of yourself holding your ID document. Both your face
            and the ID must be visible. Max 5 MB.
          </p>
        </div>
      </fieldset>

      <SubmitButton hasFiles={Boolean(idDocPath && selfiePath)} />
    </form>
  );
}

function SubmitButton({ hasFiles }: { hasFiles: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      fullWidth
      disabled={pending || !hasFiles}
    >
      {pending
        ? "Submitting…"
        : hasFiles
          ? "Submit verification"
          : "Upload both files to continue"}
    </Button>
  );
}
