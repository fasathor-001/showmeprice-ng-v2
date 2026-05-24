"use client";

// Stage 2.C Commit 9-c — client-side image processing.
//
// Two responsibilities:
//   1. compressImage — canvas-based resize + JPEG re-encode. Output ≤1600px
//      on the longest edge, JPEG q=0.85. Pure browser API (no library cost).
//      Per §3.A. Always run regardless of input size (§3.B — predictable
//      invariant).
//   2. uploadImageToStorage — XHR PUT to a signed-upload URL with
//      onUploadProgress for per-image progress (§4.A/§4.B). Returns a
//      cancellable promise — composer abort plumbing wraps this so
//      per-image × cancel + page-away cancel both stop in-flight uploads.

const TARGET_LONGEST_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  byteSize: number;
  mimeType: "image/jpeg";
}

/**
 * Compress a user-picked file to a uniform JPEG. Preserves aspect ratio.
 * Throws on unsupported MIME (file picker accept=image/* should prevent
 * this; belt-and-suspenders).
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const longestEdge = Math.max(bitmap.width, bitmap.height);
  const scale =
    longestEdge > TARGET_LONGEST_EDGE ? TARGET_LONGEST_EDGE / longestEdge : 1;
  const targetW = Math.round(bitmap.width * scale);
  const targetH = Math.round(bitmap.height * scale);

  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: JPEG_QUALITY,
    });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  }

  bitmap.close?.();

  return {
    blob,
    width: targetW,
    height: targetH,
    byteSize: blob.size,
    mimeType: "image/jpeg",
  };
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadOptions {
  signedUploadUrl: string;
  blob: Blob;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Upload a compressed JPEG via XHR PUT. XHR (not fetch) because fetch's
 * ReadableStream upload progress isn't universally supported on mobile
 * browsers; XHR's onUploadProgress works reliably on Android Chrome and
 * iOS Safari.
 */
export function uploadImageToStorage(opts: UploadOptions): Promise<void> {
  const { signedUploadUrl, blob, onProgress, signal } = opts;

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const abortHandler = () => {
      xhr.abort();
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Upload aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({ loaded: e.loaded, total: e.total });
      }
    });

    xhr.addEventListener("load", () => {
      signal?.removeEventListener("abort", abortHandler);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(`Upload failed: HTTP ${xhr.status} ${xhr.statusText || ""}`),
        );
      }
    });

    xhr.addEventListener("error", () => {
      signal?.removeEventListener("abort", abortHandler);
      reject(new Error("Upload failed: network error"));
    });

    xhr.addEventListener("timeout", () => {
      signal?.removeEventListener("abort", abortHandler);
      reject(new Error("Upload timed out"));
    });

    xhr.open("PUT", signedUploadUrl);
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.timeout = 60_000; // 60s — generous for a 5MB upload on 3G
    xhr.send(blob);
  });
}
