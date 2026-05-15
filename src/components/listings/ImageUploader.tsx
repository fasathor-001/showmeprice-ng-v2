"use client";

import { useEffect, useState } from "react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

export interface UploaderImage {
  storage_path: string;
  public_url: string;
}

interface Props {
  businessId: string;
  productId: string;
  existingImages?: UploaderImage[];
  /** Notified on every list change (add/remove/reorder) so the parent form's
   *  hidden inputs stay in sync with what'll be submitted. */
  onChange: (images: UploaderImage[]) => void;
  maxImages?: number;
}

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const DEFAULT_MAX = 8;

type UploadState = "idle" | "uploading" | "error";

export function ImageUploader({
  businessId,
  productId,
  existingImages,
  onChange,
  maxImages = DEFAULT_MAX,
}: Props) {
  const [images, setImages] = useState<UploaderImage[]>(existingImages ?? []);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string>("");
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const supabase = createBrowserSupabase();

  // Keep parent in sync. We don't put onChange in the dep array — it's
  // typically a fresh closure each parent render and would loop. The
  // contract is: notify whenever `images` changes.
  useEffect(() => {
    onChange(images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const sanitiseExt = (filename: string): string => {
    const raw = filename.split(".").pop()?.toLowerCase() ?? "bin";
    return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "bin";
  };

  const uploadOne = async (file: File, slot: number): Promise<UploaderImage | null> => {
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is over 5 MB`);
    }
    if (!(ACCEPTED_MIMES as readonly string[]).includes(file.type)) {
      throw new Error(`${file.name} is not JPG / PNG / WebP`);
    }
    const ext = sanitiseExt(file.name);
    const path = `${businessId}/${productId}/${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      throw new Error(error.message);
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { storage_path: path, public_url: pub.publicUrl };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // Reset the input so re-selecting the same file works.
    e.target.value = "";

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${maxImages} images`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setUploadError(
        `Only ${remaining} more slot${remaining === 1 ? "" : "s"} available — kept the first ${remaining}.`
      );
    } else {
      setUploadError("");
    }

    setUploadState("uploading");
    setProgress({ done: 0, total: toUpload.length });
    const uploaded: UploaderImage[] = [];
    for (let i = 0; i < toUpload.length; i++) {
      try {
        const slot = images.length + uploaded.length;
        const result = await uploadOne(toUpload[i], slot);
        if (result) uploaded.push(result);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Upload failed — please retry."
        );
        setUploadState("error");
        // Commit what's uploaded so far even if a later file failed.
        if (uploaded.length > 0) setImages((prev) => [...prev, ...uploaded]);
        return;
      }
      setProgress({ done: i + 1, total: toUpload.length });
    }
    setImages((prev) => [...prev, ...uploaded]);
    setUploadState("idle");
  };

  const deleteImage = async (idx: number) => {
    const img = images[idx];
    if (!img) return;
    // Optimistic local removal so the UI is responsive even if Storage
    // delete is slow. On failure the file becomes an orphan, picked up
    // later by K-010's eventual cleanup job.
    setImages((prev) => prev.filter((_, i) => i !== idx));
    const { error } = await supabase.storage.from(BUCKET).remove([img.storage_path]);
    if (error) {
      console.warn("Storage delete failed", img.storage_path, error.message);
    }
  };

  const swap = (a: number, b: number) => {
    setImages((prev) => {
      if (a < 0 || b < 0 || a >= prev.length || b >= prev.length) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const moveUp = (idx: number) => swap(idx, idx - 1);
  const moveDown = (idx: number) => swap(idx, idx + 1);
  const setPrimary = (idx: number) => swap(idx, 0);

  const remainingSlots = maxImages - images.length;
  const canAddMore = remainingSlots > 0 && uploadState !== "uploading";

  return (
    <div className="space-y-3">
      {uploadError && (
        <div
          role="alert"
          className="bg-danger-bg border border-danger/30 text-danger-text text-sm px-3 py-2 rounded-lg"
        >
          {uploadError}
        </div>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <li
              key={img.storage_path}
              className="relative border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50"
            >
              <div className="aspect-square bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.public_url}
                  alt={`Listing image ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {idx === 0 && (
                  <span className="absolute top-1.5 left-1.5 bg-teal-600 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                    Primary
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 p-1.5 text-xs">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    aria-label={`Move image ${idx + 1} up`}
                    className="px-1.5 py-0.5 rounded hover:bg-neutral-200 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === images.length - 1}
                    aria-label={`Move image ${idx + 1} down`}
                    className="px-1.5 py-0.5 rounded hover:bg-neutral-200 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => setPrimary(idx)}
                      className="px-1.5 py-0.5 rounded hover:bg-neutral-200 text-teal-700"
                    >
                      Set primary
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteImage(idx)}
                  aria-label={`Delete image ${idx + 1}`}
                  className="px-1.5 py-0.5 rounded hover:bg-danger-bg text-danger-text"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAddMore && (
        <label className="block">
          <span className="block text-sm text-ink-600 mb-1.5">
            {images.length === 0
              ? "Add product images (1-8, max 5 MB each)"
              : `Add more (${remainingSlots} ${remainingSlots === 1 ? "slot" : "slots"} left)`}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="block w-full text-sm text-ink-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
          />
        </label>
      )}

      {uploadState === "uploading" && (
        <p className="text-xs text-ink-600">
          Uploading {progress.done} / {progress.total}…
        </p>
      )}

      <p className="text-xs text-ink-400">
        First image is the primary one shown on marketplace cards.
      </p>

      {/* Hidden inputs for form submission. Position is implicit from
          array index; the action will INSERT product_images rows with
          position 0, 1, 2, ... matching this order. */}
      {images.map((img) => (
        <input
          key={img.storage_path}
          type="hidden"
          name="imagePaths"
          value={img.storage_path}
        />
      ))}
    </div>
  );
}
