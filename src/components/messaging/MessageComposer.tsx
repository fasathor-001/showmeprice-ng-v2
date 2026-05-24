"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui";
import {
  sendMessage,
  sendImageMessage,
} from "@/lib/messaging/actions";
import { mintMessageImageUploadUrls } from "@/lib/messaging/image-urls";
import {
  compressImage,
  uploadImageToStorage,
  type CompressedImage,
} from "@/lib/messaging/upload-image";
import { isImageMessagingEnabled } from "@/lib/feature-flags";
import { useNavigatorOnline } from "@/lib/use-navigator-online";
import { ImageAttachButton } from "./ImageAttachButton";
import { SendUndoStrip } from "./SendUndoStrip";
import {
  useMessagesShell,
  type UploadingMessage,
} from "./MessagesShell";

// Stage 2.B Commit 4 — message composer (refactored for optimistic UI in
// Commit 5 per surface findings E + F).
//
// Architecture decisions (current, includes Commit 5 changes marked ←):
//   A. Natural end of page → Commit 4.1 lifted layout to fixed-fullheight at
//      route-segment level; this composer is the last child of that column.
//   B. Multi-line textarea, auto-grow 1-5 rows then scroll.
//   C. Enter sends + Shift+Enter newline (uniform). `enterkeyhint="send"`
//      gives mobile virtual keyboards a hint.
//   D. No template selector (D-108 templates ship in Commit 7).
//   E. ContainsWarning → persistent inline notice; replace, not stack.
//   F. Phone-unverified → REPLACE composer with verify CTA card.
//   G. Composer always enabled regardless of conversation status.
//   ← H. Commit 5: OPTIMISTIC SEND. Append a temp bubble immediately via the
//        shell context, clear the textarea, then call sendMessage. On server
//        confirmation: shell swaps tempId → realId. On error: shell marks
//        the bubble as failed; user can dismiss via the bubble itself.
//        Auth / participation / filter errors still surface inline; the
//        optimistic bubble is rolled back via dismiss-on-fail semantics.
//   I. No D-120 share button hooks (separate commit).

const MAX_LEN = 2000;
const COUNTER_THRESHOLD = 1600;
const MAX_TEXTAREA_HEIGHT = 5 * 24 + 16;

// TC-010: sessionStorage key prefix for draft preservation across auth-
// expiry redirects. Namespaced `sp:msg-draft:` (per §4.A surface findings)
// so future draft types (listing drafts, etc.) can coexist without
// collisions. sessionStorage is tab-scoped; drafts naturally clear on tab
// close so transient negotiation content doesn't persist to disk.
const DRAFT_KEY_PREFIX = "sp:msg-draft:";

// TC-002: banner-level retry budget (mirrors the bubble-level RETRY_BUDGET
// in MessageBubble). After the 3rd failure, the banner Retry link disappears
// and the copy escalates.
const BANNER_RETRY_BUDGET = 3;

interface MessageComposerProps {
  conversationId: string;
  isPhoneVerified: boolean;
  currentUserId: string;
}

export function MessageComposer({
  conversationId,
  isPhoneVerified,
  currentUserId,
}: MessageComposerProps) {
  if (!isPhoneVerified) {
    return (
      <div className="px-3 sm:px-6 py-4 border-t border-neutral-200 bg-white shrink-0">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center max-w-md mx-auto">
          <h2 className="text-sm font-medium text-ink mb-2">
            Verify your phone to send messages
          </h2>
          <p className="text-xs text-ink-600 mb-4">
            For everyone&apos;s safety, only phone-verified users can send
            messages on ShowMePrice.
          </p>
          <Link
            href={`/verify-phone?next=/messages/${conversationId}`}
            className="inline-flex items-center justify-center bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700"
          >
            Verify phone →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Composer
      conversationId={conversationId}
      currentUserId={currentUserId}
    />
  );
}

function Composer({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const {
    optimisticSend,
    confirmSend,
    failSend,
    addOptimisticImageMessage,
    dismissOptimisticImageMessage,
    setUploadingMessage,
    uploadingMessages,
  } = useMessagesShell();
  const isOnline = useNavigatorOnline();
  const imageMessagingEnabled = isImageMessagingEnabled();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // 9-c image attach state. Compressed blobs held LOCALLY in composer
  // until Send tap; on Send the bubble is registered via context +
  // grace timer starts; on grace expiry uploads begin.
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{
      id: string;
      file: File;
      compressed: CompressedImage | null;
      blobUrl: string;
      compressing: boolean;
      failed: boolean;
    }>
  >([]);
  // 9-c — when set, an image-message is in the 3s send-undo grace window.
  // Holds the tempId so timer/undo handlers can target the right bubble.
  const [scheduledTempId, setScheduledTempId] = useState<string | null>(null);
  // TC-002: cache the last failed-send content for the banner Retry link.
  // null when no recent failure (banner Retry hidden). Reset on successful
  // send. Budget tracked alongside via lastFailureRetries.
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(
    null,
  );
  const [lastFailureRetries, setLastFailureRetries] = useState(0);
  // TC-002 §1.E: show "You're offline..." inline below the banner when the
  // user attempted to send/retry while offline. Cleared when isOnline returns
  // to true OR when content is cleared via successful send.
  const [showOfflineHint, setShowOfflineHint] = useState(false);

  // TC-010: hydrate textarea from any stashed draft on mount. Silent restore
  // per §4.B surface findings — no toast, no visual indicator. Drafts come
  // from a pre-send action that hit auth-expiry and redirected the user;
  // after re-login they land back here with their content waiting.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stashed = sessionStorage.getItem(
        `${DRAFT_KEY_PREFIX}${conversationId}`,
      );
      if (stashed && stashed.trim().length > 0) {
        setContent(stashed);
      }
    } catch {
      // sessionStorage may throw in private-mode Safari; non-fatal.
    }
  }, [conversationId]);

  // Auto-grow textarea on content change.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
  }, [content]);

  // Clear the offline hint when the user reconnects.
  useEffect(() => {
    if (isOnline && showOfflineHint) setShowOfflineHint(false);
  }, [isOnline, showOfflineHint]);

  // TC-010 (Commit 8.3 — single-responsibility refactor): each helper does
  // exactly one thing.
  //   - writeDraft PERSISTS a non-empty draft. Never removes — calling it
  //     with an empty string is a no-op, NOT a stealth delete. This is the
  //     key bug from the original 8.0 implementation: writeDraft("") removing
  //     the key created a hidden invariant where ANY browser quirk that
  //     synthesised an onChange with empty value (extensions, autofill,
  //     accessibility tools after setContent("")) would silently wipe the
  //     draft, defeating the auth-expiry restore path.
  //   - dropDraft REMOVES. Only called from explicit cleanup paths.
  // Callsite contract:
  //   - handleChange writes on every non-empty keystroke; calls dropDraft
  //     when the textarea transitions to empty by USER ACTION (Backspace
  //     to empty). The empty-by-user path is the only legitimate clear
  //     during typing.
  //   - handleSend writes BEFORE setContent("") so the draft is in storage
  //     before any re-render can fire stray onChange events.
  //   - performSend's auth-expiry / phone-verify / not-found paths
  //     DEFENSIVELY re-write the draft immediately before router.push as
  //     belt-and-suspenders. The cost is one extra ~1ms sync setItem; the
  //     benefit is the draft survives regardless of any quirk in between.
  //   - performSend on confirmed success calls dropDraft.
  //   - performSend on filter/other inline error does nothing — content is
  //     restored to the textarea via setContent(text); stash still matches.
  const writeDraft = (value: string) => {
    if (typeof window === "undefined") return;
    if (value.length === 0) return; // no-op; explicit removal goes through dropDraft
    try {
      sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${conversationId}`, value);
    } catch {
      // sessionStorage may throw in private-mode Safari; non-fatal.
    }
  };
  const dropDraft = () => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${conversationId}`);
    } catch {
      // non-fatal
    }
  };

  const trimmedLen = content.trim().length;
  const isEmpty = trimmedLen === 0;
  const isOverLimit = content.length > MAX_LEN;
  const showCounter = content.length >= COUNTER_THRESHOLD;
  // 9-c — send-disabled rules:
  // · Disabled if textarea is empty AND no ready attachments
  // · Disabled while over-limit or already sending text
  // · Disabled while any attachment is still compressing
  // · Disabled while a scheduled image message is awaiting grace expiry
  //   (the SendUndoStrip owns this window; user must Undo first to send
  //   a different message)
  const hasReadyAttachment = pendingAttachments.some(
    (a) => !a.compressing && !a.failed && a.compressed,
  );
  const anyCompressing = pendingAttachments.some((a) => a.compressing);
  const sendDisabled =
    (isEmpty && !hasReadyAttachment) ||
    isOverLimit ||
    isSending ||
    anyCompressing ||
    Boolean(scheduledTempId);
  const attachDisabled =
    pendingAttachments.length >= 3 ||
    Boolean(scheduledTempId) ||
    isSending;

  // Core send routine, parameterised so the same path serves both the
  // primary Send button and the TC-002 banner Retry link.
  const performSend = async (text: string) => {
    setIsSending(true);
    setError(null);

    // Optimistic: dispatch to shell, get tempId for later reconciliation.
    const tempId = optimisticSend(conversationId, {
      conversationId,
      senderId: currentUserId,
      messageType: "text",
      content: text,
      metadata: {},
      attachmentUrl: null,
      readAt: null,
    });

    try {
      const result = await sendMessage(conversationId, text);

      // Auth / participation errors → redirect (rare; backstop).
      // 8.3 fix: defensively re-write the draft to sessionStorage IMMEDIATELY
      // before router.push. handleSend already wrote it once, but anything
      // between then and now could theoretically have cleared it (browser
      // extensions, autofill, etc.). One extra sync setItem is cheap; missing
      // the draft after auth-expiry is the entire point of TC-010 — the
      // worst possible UX regression.
      if (result.error === "Unauthorized") {
        failSend(conversationId, tempId);
        writeDraft(text);
        router.push(`/sign-in?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "PhoneVerificationRequired") {
        failSend(conversationId, tempId);
        writeDraft(text);
        router.push(`/verify-phone?next=/messages/${conversationId}`);
        return;
      }
      if (result.error === "NotFound" || result.error === "Forbidden") {
        // NotFound/Forbidden go to /messages list, not /messages/[id] — the
        // conversation may no longer exist OR the user isn't a participant.
        // Either way, restoring the draft on next visit isn't meaningful
        // (no thread to restore into), so we don't writeDraft here.
        failSend(conversationId, tempId);
        router.push("/messages");
        return;
      }

      // Filter / validation errors → mark bubble failed + inline banner.
      // Cache the failed content for banner Retry (TC-002). Bump retry count
      // so the 3-attempt budget escalates the banner copy after exhaustion.
      const noteFailure = () => {
        setLastFailedContent(text);
        setLastFailureRetries((n) => n + 1);
      };
      if (result.error === "ContentBlocked") {
        failSend(conversationId, tempId);
        setError(result.reason ?? "This message can't be sent.");
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "TooLong") {
        failSend(conversationId, tempId);
        setError(`Message is too long (${MAX_LEN} character maximum).`);
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "Empty") {
        failSend(conversationId, tempId);
        setError("Type a message first.");
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "FilterUnavailable") {
        failSend(conversationId, tempId);
        setError("Couldn't check message safety — please try again.");
        noteFailure();
        setContent(text);
        return;
      }
      if (result.error === "Unknown") {
        failSend(conversationId, tempId);
        setError("Couldn't send. Please try again.");
        noteFailure();
        setContent(text);
        return;
      }

      // Success — swap tempId for real message via the shell + drop draft.
      if (result.messageId) {
        confirmSend(conversationId, tempId, {
          id: result.messageId,
          conversationId,
          senderId: currentUserId,
          messageType: "text",
          content: text,
          metadata: {},
          attachmentUrl: null,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
      }
      // TC-010: successful send clears the draft stash + the failure cache.
      dropDraft();
      setLastFailedContent(null);
      setLastFailureRetries(0);

      if (result.containsWarning) {
        setWarning(
          "Your message contained content that may move the conversation off-platform. Keep important details on ShowMePrice for safety.",
        );
      }

      textareaRef.current?.focus();
    } catch (err) {
      console.error("[MessageComposer] send failed", err);
      failSend(conversationId, tempId);
      setError("Couldn't send. Please try again.");
      setLastFailedContent(text);
      setLastFailureRetries((n) => n + 1);
      setContent(text);
    } finally {
      setIsSending(false);
    }
  };

  // ===== 9-c image-attach orchestration =====

  // Cleanup blob URLs on unmount so user's RAM stays calm.
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => URL.revokeObjectURL(a.blobUrl));
    };
    // Empty deps: revoke on unmount only. Per-item revoke happens in
    // handleRemoveAttachment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilesPicked = async (files: File[]) => {
    const capacity = 3 - pendingAttachments.length;
    if (capacity <= 0) return;
    let taken = files;
    let overflow = false;
    if (files.length > capacity) {
      taken = files.slice(0, capacity);
      overflow = true;
    }
    if (overflow) {
      setWarning(
        `Added ${capacity} of ${files.length} photos — max 3 per message.`,
      );
    }
    // §2.C — 30MB raw upper bound.
    const MAX_RAW = 30 * 1024 * 1024;
    const accepted = taken.filter((f) => {
      if (f.size > MAX_RAW) {
        setWarning("Photo too large — please pick a smaller image.");
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return;

    const newDrafts = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      compressed: null as CompressedImage | null,
      blobUrl: URL.createObjectURL(file),
      compressing: true,
      failed: false,
    }));
    setPendingAttachments((prev) => [...prev, ...newDrafts]);

    // Parallel compression. §3.B: always compress (predictable invariant).
    await Promise.all(
      newDrafts.map(async (draft) => {
        try {
          const compressed = await compressImage(draft.file);
          setPendingAttachments((prev) =>
            prev.map((a) =>
              a.id === draft.id
                ? { ...a, compressed, compressing: false }
                : a,
            ),
          );
        } catch (err) {
          console.error("[MessageComposer] compression failed", err);
          setPendingAttachments((prev) =>
            prev.map((a) =>
              a.id === draft.id
                ? { ...a, compressing: false, failed: true }
                : a,
            ),
          );
        }
      }),
    );
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.blobUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // 9-c.N3 — after 3s grace expires, start uploads. uploads are PARALLEL;
  // per-image progress + failure tracked in uploadingMessages state via
  // setUploadingMessage. NEVER touches the realtime reducer (per 9-c.N1).
  const performImageUploads = async (tempId: string) => {
    const entry = uploadingMessages[tempId];
    if (!entry) return;

    // Transition phase to uploading (composer-local; reducer untouched).
    setUploadingMessage(tempId, (prev) =>
      prev ? { ...prev, phase: "uploading" } : prev,
    );

    // Mint upload URLs in one batch.
    const positions = entry.images.map((img) => img.position);
    const mintResult = await mintMessageImageUploadUrls(
      conversationId,
      tempId,
      positions,
    );
    if (mintResult.error || !mintResult.slots) {
      console.error(
        "[MessageComposer] mintMessageImageUploadUrls failed",
        mintResult.error,
      );
      failImageSend(tempId, "Couldn't prepare upload. Try again.");
      return;
    }

    // Parallel uploads with per-image progress + cancellation.
    const outcomes = await Promise.all(
      entry.images.map(async (img, idx) => {
        const slot = mintResult.slots![idx]!;
        try {
          await uploadImageToStorage({
            signedUploadUrl: slot.signedUploadUrl,
            blob: img.blob,
            signal: img.abortController.signal,
            onProgress: ({ loaded, total }) => {
              const progress =
                total > 0 ? Math.round((loaded / total) * 100) : 0;
              setUploadingMessage(tempId, (prev) =>
                prev
                  ? {
                      ...prev,
                      images: prev.images.map((i) =>
                        i.position === img.position
                          ? { ...i, progress }
                          : i,
                      ),
                    }
                  : prev,
              );
            },
          });
          // Mark this image completed + record its storage path.
          setUploadingMessage(tempId, (prev) =>
            prev
              ? {
                  ...prev,
                  images: prev.images.map((i) =>
                    i.position === img.position
                      ? {
                          ...i,
                          progress: 100,
                          storagePath: slot.storagePath,
                        }
                      : i,
                  ),
                }
              : prev,
          );
          return {
            ok: true as const,
            position: img.position,
            storagePath: slot.storagePath,
            width: img.width,
            height: img.height,
            byteSize: img.byteSize,
            mimeType: img.mimeType,
          };
        } catch (err) {
          // Skip silently if aborted (Undo path).
          if (
            err instanceof DOMException &&
            err.name === "AbortError"
          ) {
            return { ok: false as const, position: img.position };
          }
          console.error(
            "[MessageComposer] image upload failed",
            img.position,
            err,
          );
          setUploadingMessage(tempId, (prev) =>
            prev
              ? {
                  ...prev,
                  images: prev.images.map((i) =>
                    i.position === img.position
                      ? { ...i, failed: true }
                      : i,
                  ),
                }
              : prev,
          );
          return { ok: false as const, position: img.position };
        }
      }),
    );

    const successful = outcomes.filter(
      (o): o is Extract<typeof outcomes[number], { ok: true }> => o.ok,
    );
    if (successful.length === 0) {
      // All uploads failed — leave bubble in failed state for user retry.
      failImageSend(tempId, "Couldn't upload photos. Try again.");
      return;
    }

    // Transition phase to confirming and call server action.
    setUploadingMessage(tempId, (prev) =>
      prev ? { ...prev, phase: "confirming" } : prev,
    );

    const captionForSend = entry.caption;
    const result = await sendImageMessage(
      conversationId,
      tempId,
      successful.map((s) => ({
        position: s.position,
        storagePath: s.storagePath,
        width: s.width,
        height: s.height,
        byteSize: s.byteSize,
        mimeType: s.mimeType,
      })),
      captionForSend.length > 0 ? captionForSend : null,
    );

    if (result.error === "Unauthorized") {
      failSend(conversationId, tempId);
      setUploadingMessage(tempId, () => undefined);
      router.push(`/sign-in?next=/messages/${conversationId}`);
      return;
    }
    if (result.error === "PhoneVerificationRequired") {
      failSend(conversationId, tempId);
      setUploadingMessage(tempId, () => undefined);
      router.push(`/verify-phone?next=/messages/${conversationId}`);
      return;
    }
    if (result.error) {
      // Caption blocked or other inline error — bubble enters failed
      // state, user can dismiss or re-edit caption + retry (orphan
      // storage objects go to K-010 cleanup per 9-c.N6).
      failImageSend(tempId, "Couldn't send. Please try again.");
      return;
    }

    // SUCCESS — swap tempId entry with real MessageRow + clean up state.
    // Build the final ThreadMessage shape with images populated from
    // imageIds[] returned by the server. Reducer's SERVER_CONFIRMED path
    // replaces the optimistic bubble with this final shape.
    if (result.messageId) {
      const finalImages = successful.map((s, i) => ({
        position: s.position,
        width: s.width,
        height: s.height,
        storagePath: s.storagePath,
        imageId: result.imageIds?.[i] ?? "",
      }));
      confirmSend(conversationId, tempId, {
        id: result.messageId,
        conversationId,
        senderId: currentUserId,
        messageType: "image",
        content: captionForSend.length > 0 ? captionForSend : null,
        metadata: { has_images: true },
        attachmentUrl: null,
        readAt: null,
        createdAt: new Date().toISOString(),
        images: finalImages,
      });
    }
    // Clean up composer-local upload state. Blob URLs stay alive on the
    // confirmed bubble (sender's local preview) until tab close.
    setUploadingMessage(tempId, () => undefined);
  };

  // Helper: mark the bubble as failed + leave attachments in place for retry.
  const failImageSend = (tempId: string, errorMsg: string) => {
    failSend(conversationId, tempId);
    setError(errorMsg);
    setUploadingMessage(tempId, (prev) =>
      prev ? { ...prev, phase: "confirming" } : prev,
    );
  };

  // §14.A — fired by SendUndoStrip when its 3s timer expires.
  const handleScheduledProceed = () => {
    if (!scheduledTempId) return;
    const tempId = scheduledTempId;
    setScheduledTempId(null);
    void performImageUploads(tempId);
  };

  // §14.A — fired by SendUndoStrip's Undo button within the 3s window.
  const handleScheduledCancel = () => {
    if (!scheduledTempId) return;
    const tempId = scheduledTempId;
    const entry = uploadingMessages[tempId];
    // Abort any in-flight uploads (shouldn't be any during grace — uploads
    // don't start until grace expires per 9-c.N3 — but defense in depth).
    if (entry) {
      entry.images.forEach((img) => img.abortController.abort());
    }
    // Remove the optimistic bubble from the reducer.
    dismissOptimisticImageMessage(tempId, conversationId);
    // Clear the upload state entry.
    setUploadingMessage(tempId, () => undefined);
    // Restore attachments to compose state so the user can edit + re-send.
    if (entry) {
      // Reconstruct pendingAttachments from the upload-state's
      // compressed-blob references. The blob URLs are still alive.
      setPendingAttachments(
        entry.images.map((img) => {
          // Reconstruct a File-like from the blob (composer doesn't need
          // the original File object after compression).
          const file = new File([img.blob], "photo.jpg", {
            type: "image/jpeg",
          });
          return {
            id: crypto.randomUUID(),
            file,
            compressed: {
              blob: img.blob,
              width: img.width,
              height: img.height,
              byteSize: img.byteSize,
              mimeType: "image/jpeg",
            },
            blobUrl: img.blobUrl,
            compressing: false,
            failed: false,
          };
        }),
      );
      setContent(entry.caption);
    }
    setScheduledTempId(null);
  };

  // §14.A — fired when user taps Send and at least one ready attachment
  // is present. Builds the optimistic bubble + scheduledImageMessage
  // state + arms the SendUndoStrip via setScheduledTempId.
  const handleSendImageMessage = () => {
    const readyAttachments = pendingAttachments.filter(
      (a) => !a.compressing && !a.failed && a.compressed,
    );
    if (readyAttachments.length === 0) return;
    // §1.E — same offline guard as text path.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setShowOfflineHint(true);
      setError("Couldn't send. Please try again.");
      return;
    }

    const tempId = crypto.randomUUID();
    const caption = content.trim();

    // Register the upload state in MessagesShell's local slice (NOT in
    // the realtime reducer). 9-c.N1 architecture: reducer stays pure;
    // per-image progress fires through this slice only.
    const uploadEntry: UploadingMessage = {
      tempId,
      conversationId,
      phase: "scheduled",
      caption,
      images: readyAttachments.map((a, i) => ({
        position: i,
        blobUrl: a.blobUrl,
        width: a.compressed!.width,
        height: a.compressed!.height,
        byteSize: a.compressed!.byteSize,
        mimeType: "image/jpeg",
        blob: a.compressed!.blob,
        progress: 0,
        failed: false,
        abortController: new AbortController(),
      })),
    };
    setUploadingMessage(tempId, () => uploadEntry);

    // Add the optimistic bubble to the reducer. Wraps OPTIMISTIC_ADD
    // internally; no raw dispatch via context (9-c.N2).
    addOptimisticImageMessage({
      tempId,
      conversationId,
      senderId: currentUserId,
      caption,
      images: readyAttachments.map((a, i) => ({
        position: i,
        blobUrl: a.blobUrl,
        width: a.compressed!.width,
        height: a.compressed!.height,
      })),
    });

    // Clear compose state — user can start typing the next message during
    // the 3s grace window. Attachments are now held in the upload state
    // (not pendingAttachments).
    setPendingAttachments([]);
    setContent("");
    dropDraft();

    // Arm the SendUndoStrip.
    setScheduledTempId(tempId);
  };

  // ===== End 9-c image-attach orchestration =====

  const handleSend = async () => {
    // If there are attachments, route to image-send path.
    if (pendingAttachments.length > 0) {
      handleSendImageMessage();
      return;
    }

    if (sendDisabled) return;

    // §1.E: navigator.onLine guard. If offline, surface the inline hint and
    // do not consume any retry budget. Banner Retry path uses the same guard
    // via handleBannerRetry.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setShowOfflineHint(true);
      setError("Couldn't send. Please try again.");
      // Cache the content so the banner Retry can re-attempt later.
      setLastFailedContent(content);
      return;
    }

    // Capture text + persist BEFORE clearing the textarea. Ordering matters:
    // writeDraft must complete before setContent("") schedules the re-render
    // (8.3 fix — see helper comment above for the rationale).
    const text = content;
    writeDraft(text);
    setContent("");
    await performSend(text);
  };

  const handleBannerRetry = async () => {
    if (!lastFailedContent) return;
    if (isSending) return;
    if (lastFailureRetries >= BANNER_RETRY_BUDGET) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setShowOfflineHint(true);
      return;
    }
    setShowOfflineHint(false);
    await performSend(lastFailedContent);
  };

  // Commit 8.2: mirror the bubble's "↻ Retry · Dismiss" pair on the banner.
  // §1.B originally relied on "Dismiss is implicit — typing clears the banner,"
  // but that fell apart in the offline-attempt case: the banner appears, no
  // optimistic bubble is created (the offline guard returns before
  // optimisticSend), so the user has no bubble-level Dismiss either. Result:
  // they're stuck looking at a danger banner with only Retry, and the only
  // way to clear it is to lose their textarea draft. Dismiss clears the
  // banner state but preserves the draft — they can come back to it later.
  const handleBannerDismiss = () => {
    setError(null);
    setLastFailedContent(null);
    setLastFailureRetries(0);
    setShowOfflineHint(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    // TC-010 (8.3): keep sessionStorage in sync with the user's typing.
    // Branching explicit: writeDraft persists only, dropDraft removes only.
    // The empty-by-user-action path (Backspace to empty, Ctrl+A → Delete) is
    // the ONLY legitimate keystroke-driven clear; any other observation of
    // next === "" (e.g., a synthetic onChange from a browser extension after
    // a programmatic setContent("")) would be a misfire we must not honour.
    // This handler can't distinguish "user cleared" from "extension misfire"
    // perfectly, but in the user-cleared case the textarea is already empty
    // and dropping the draft matches user intent; in the misfire case the
    // textarea STILL renders "" but the user typed something real, and the
    // defensive write in handleSend's redirect paths (performSend §) restores
    // the draft anyway right before navigation. Net: either path preserves
    // the user's content where it matters.
    if (next.length === 0) {
      dropDraft();
    } else {
      writeDraft(next);
    }
    if (error) setError(null);
    // User started typing a new message — they've moved past the previous
    // failure. Clear the banner Retry context so the stale failed-send isn't
    // offered for retry once they start a new attempt.
    if (lastFailedContent !== null && next !== lastFailedContent) {
      setLastFailedContent(null);
      setLastFailureRetries(0);
    }
  };

  const counterClass = isOverLimit
    ? "text-danger-text"
    : content.length >= 1900
      ? "text-ink"
      : "text-ink-400";

  const textareaBorderClass = isOverLimit
    ? "border-danger-text focus:ring-danger-text focus:border-danger-text"
    : "border-neutral-200 focus:ring-teal-400 focus:border-teal-400";

  return (
    <div className="px-3 sm:px-6 py-3 border-t border-neutral-200 bg-white shrink-0">
      {/* §14.A — 3s send-undo grace strip. Visible only when an image
          message is in 'scheduled' phase awaiting timer expiry / Undo. */}
      {scheduledTempId && (
        <SendUndoStrip
          onProceed={handleScheduledProceed}
          onCancel={handleScheduledCancel}
        />
      )}
      {warning && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-warning-bg text-warning-text text-xs flex items-start gap-2">
          <span className="flex-1">{warning}</span>
          <button
            type="button"
            onClick={() => setWarning(null)}
            className="shrink-0 underline hover:no-underline text-warning-text"
            aria-label="Dismiss warning"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div
          className="mb-2 px-3 py-2 rounded-lg bg-danger-bg text-danger-text text-xs"
          role="alert"
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="flex-1">
              {lastFailureRetries >= BANNER_RETRY_BUDGET ? (
                <>
                  Couldn&apos;t send — check your connection and try again
                  later.
                </>
              ) : (
                error
              )}
            </span>
            {/* TC-002 + Commit 8.2: banner mirrors the bubble's "↻ Retry ·
                Dismiss" pair. Retry hidden when budget exhausted (escalated
                copy takes over the left span) or while a send is in flight.
                Dismiss is always available when the banner is visible — gives
                users an explicit way to clear the danger state without losing
                their textarea draft. */}
            <div className="flex items-baseline gap-2 shrink-0">
              {lastFailedContent !== null &&
                lastFailureRetries < BANNER_RETRY_BUDGET &&
                !isSending && (
                  <>
                    <button
                      type="button"
                      onClick={handleBannerRetry}
                      className="font-medium underline hover:no-underline focus:outline-none focus-visible:no-underline text-danger-text"
                      aria-label="Retry sending"
                    >
                      Retry
                    </button>
                    <span
                      className="text-danger-text/60"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  </>
                )}
              <button
                type="button"
                onClick={handleBannerDismiss}
                className="font-medium underline hover:no-underline focus:outline-none focus-visible:no-underline text-danger-text"
                aria-label="Dismiss this notice"
              >
                Dismiss
              </button>
            </div>
          </div>
          {showOfflineHint && !isOnline && (
            <div className="mt-1 text-ink-600">
              You&apos;re offline. Connect to the internet to send.
            </div>
          )}
        </div>
      )}
      {/* 9-c — attachment preview strip above textarea. Calm UI: fixed
          64×64 thumbnails, no layout shifts as compression resolves. */}
      {pendingAttachments.length > 0 && (
        <div
          className="mb-2 flex items-center gap-2 flex-wrap"
          aria-label="Photos to send"
        >
          {pendingAttachments.map((a) => (
            <div
              key={a.id}
              className="relative w-16 h-16 rounded-lg overflow-hidden bg-neutral-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.blobUrl}
                alt=""
                className={`w-full h-full object-cover ${a.compressing ? "opacity-60" : ""}`}
                draggable={false}
              />
              {a.compressing && (
                <div
                  className="absolute inset-0 bg-white/10 animate-pulse"
                  aria-label="Processing"
                />
              )}
              {a.failed && (
                <div className="absolute inset-0 flex items-center justify-center bg-danger-bg/80 text-danger-text text-[10px] text-center px-1">
                  Format not supported
                </div>
              )}
              <button
                type="button"
                onClick={() => handleRemoveAttachment(a.id)}
                aria-label="Remove this photo"
                className="absolute top-0.5 right-0.5 w-5 h-5 inline-flex items-center justify-center rounded-full bg-ink/60 hover:bg-ink/80 text-white text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {/* §1.A — image attach button. §1.B camera icon + teal accent dot
            (§14.E). Gated on feature flag (§9-c.N7) — hidden when off.
            Hidden during scheduled-grace too (user must Undo first). */}
        {imageMessagingEnabled && !scheduledTempId && (
          <ImageAttachButton
            disabled={attachDisabled}
            onFilesPicked={handleFilesPicked}
          />
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            pendingAttachments.length > 0
              ? "Add a note (optional)"
              : "Type a message"
          }
          rows={1}
          enterKeyHint="send"
          disabled={isSending || Boolean(scheduledTempId)}
          className={`flex-1 min-h-[40px] resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-neutral-50 disabled:cursor-not-allowed ${textareaBorderClass}`}
          aria-label="Message"
          aria-invalid={isOverLimit || Boolean(error)}
          style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleSend}
          disabled={sendDisabled}
          aria-label="Send message"
        >
          {isSending ? "Sending…" : "Send"}
        </Button>
      </div>
      {showCounter && (
        <div className={`mt-1 text-xs text-right ${counterClass}`}>
          {content.length} / {MAX_LEN}
        </div>
      )}
    </div>
  );
}
