"use client";

// E.2.18.0 / D-142 Step 2 — business avatar upload client component.
// Mirrors the ImageUploader.tsx shape (browser-direct upload to Supabase
// Storage using the authenticated session, RLS-enforced ownership at the
// bucket layer) but drastically simpler because we have exactly one
// image, not a 1-8 gallery. No reorder, no primary toggle, no partial-
// batch warning — just upload-or-replace + remove.
//
// Flow:
//   1. Client picks a file → validates size + MIME locally.
//   2. Optimistic preview swap via URL.createObjectURL (so the seller
//      sees their new avatar immediately even before upload finishes).
//   3. Direct upload to business-avatars/{business_id}/avatar-{ts}.{ext}.
//      Storage RLS rejects if the folder doesn't match an owned
//      business; that's defense in depth on top of our owner-id check
//      in the server action below.
//   4. Server action updateBusinessAvatarAction persists the path to
//      businesses.logo_path and best-effort deletes the previous file.
//   5. Server action redirects to /dashboard/business-profile?toast=…
//      so the seller sees confirmation.
//
// Replace = same flow, new timestamped filename guarantees a different
// public URL → CDN cache auto-busts.
// Remove = removeBusinessAvatarAction nulls the column and deletes the
// storage object best-effort.

import { useRef, useState, useTransition } from "react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { Avatar, Button } from "@/components/ui";
import {
  updateBusinessAvatarAction,
  removeBusinessAvatarAction,
} from "@/app/(auth)/actions";

interface Props {
  businessId: string;
  businessName: string;
  currentLogoPublicUrl: string | null;
}

const BUCKET = "business-avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

type UploadState = "idle" | "uploading" | "error";

export function BusinessAvatarUploader({
  businessId,
  businessName,
  currentLogoPublicUrl,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    currentLogoPublicUrl,
  );
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserSupabase();

  // File-extension sanitizer matches ImageUploader.tsx pattern.
  const sanitiseExt = (filename: string): string => {
    const raw = filename.split(".").pop()?.toLowerCase() ?? "bin";
    return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "bin";
  };

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file works.
    e.target.value = "";
    if (!file) return;
    setUploadError("");

    if (file.size > MAX_BYTES) {
      setUploadError(`${file.name} is over 2 MB`);
      setUploadState("error");
      return;
    }
    if (!(ACCEPTED_MIMES as readonly string[]).includes(file.type)) {
      setUploadError(`${file.name} is not JPG / PNG / WebP`);
      setUploadState("error");
      return;
    }

    // Optimistic local preview. URL.createObjectURL returns a blob:
    // URL that's valid until revoked; we don't revoke here because
    // the page navigates after the server action redirects.
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploadState("uploading");

    const ext = sanitiseExt(file.name);
    const path = `${businessId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      setUploadError(error.message);
      setUploadState("error");
      // Revert preview to whatever was showing before this attempt.
      setPreviewUrl(currentLogoPublicUrl);
      return;
    }

    // Persist via server action. The action also best-effort deletes
    // the previous file and redirects with a toast — the page render
    // refreshes from the DB after the redirect lands.
    const fd = new FormData();
    fd.append("logoPath", path);
    startTransition(() => updateBusinessAvatarAction(fd));
  }

  function handleRemove() {
    setPreviewUrl(null);
    startTransition(() => removeBusinessAvatarAction());
  }

  const hasAvatar = previewUrl != null;
  const isBusy = uploadState === "uploading" || isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar
          src={previewUrl}
          initials={businessName.slice(0, 2)}
          alt={businessName}
          size="xl"
        />
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
          >
            {isBusy
              ? "Uploading…"
              : hasAvatar
                ? "Replace"
                : "Upload avatar"}
          </Button>
          {hasAvatar && !isBusy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-400">
        Square images look best — 400×400 or larger. JPG, PNG, or WebP,
        max 2 MB.
      </p>

      {uploadError && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2 rounded-lg"
        >
          {uploadError}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
        aria-label="Choose avatar image"
      />
    </div>
  );
}
