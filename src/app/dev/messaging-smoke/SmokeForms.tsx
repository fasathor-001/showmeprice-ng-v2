"use client";

// Stage 2.B dev smoke harness (Commit 1.5, K-031). Invokes the messaging
// server actions directly and renders their JSON result. Dev-only — the parent
// server page 404s in production. Remove/admin-gate before public beta (K-031).

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  createConversation,
  sendMessage,
  listConversations,
  getMessages,
  markConversationAsRead,
} from "@/lib/messaging/actions";

const inputCls =
  "block w-full bg-white border border-neutral-300 rounded-lg text-sm text-ink px-3 py-2 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-400";

function ResultBox({ value }: { value: unknown }) {
  if (value === undefined) return null;
  return (
    <pre className="mt-2 text-xs bg-neutral-100 text-ink rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function SmokeForms() {
  const [isPending, startTransition] = useTransition();

  const [ccListingId, setCcListingId] = useState("");
  const [ccContent, setCcContent] = useState("");
  const [ccTemplateId, setCcTemplateId] = useState("");
  const [ccResult, setCcResult] = useState<unknown>();

  const [smConvId, setSmConvId] = useState("");
  const [smContent, setSmContent] = useState("");
  const [smResult, setSmResult] = useState<unknown>();

  const [lcRole, setLcRole] = useState<"buyer" | "seller" | "all">("all");
  const [lcResult, setLcResult] = useState<unknown>();

  const [gmConvId, setGmConvId] = useState("");
  const [gmResult, setGmResult] = useState<unknown>();

  const [mrConvId, setMrConvId] = useState("");
  const [mrResult, setMrResult] = useState<unknown>();

  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <h2 className="text-base font-medium text-ink mb-2">1. createConversation</h2>
        <div className="space-y-2">
          <input
            className={inputCls}
            placeholder="listingId (published; NOT your own)"
            value={ccListingId}
            onChange={(e) => setCcListingId(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="first message content (try a clean msg, then a wa.me/... link)"
            value={ccContent}
            onChange={(e) => setCcContent(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="templateId (optional)"
            value={ccTemplateId}
            onChange={(e) => setCcTemplateId(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setCcResult(
                  await createConversation(
                    ccListingId.trim(),
                    ccContent,
                    ccTemplateId.trim() || undefined,
                  ),
                );
              })
            }
          >
            Run createConversation
          </Button>
        </div>
        <ResultBox value={ccResult} />
      </section>

      <section>
        <h2 className="text-base font-medium text-ink mb-2">2. sendMessage</h2>
        <div className="space-y-2">
          <input
            className={inputCls}
            placeholder="conversationId"
            value={smConvId}
            onChange={(e) => setSmConvId(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="content (try clean, then email@x.com for warn, then wa.me/... for block)"
            value={smContent}
            onChange={(e) => setSmContent(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setSmResult(await sendMessage(smConvId.trim(), smContent));
              })
            }
          >
            Run sendMessage
          </Button>
        </div>
        <ResultBox value={smResult} />
      </section>

      <section>
        <h2 className="text-base font-medium text-ink mb-2">3. listConversations</h2>
        <div className="space-y-2">
          <select
            className={inputCls}
            value={lcRole}
            onChange={(e) => setLcRole(e.target.value as "buyer" | "seller" | "all")}
          >
            <option value="all">all</option>
            <option value="buyer">buyer</option>
            <option value="seller">seller</option>
          </select>
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setLcResult(await listConversations(lcRole));
              })
            }
          >
            Run listConversations
          </Button>
        </div>
        <ResultBox value={lcResult} />
      </section>

      <section>
        <h2 className="text-base font-medium text-ink mb-2">4. getMessages</h2>
        <div className="space-y-2">
          <input
            className={inputCls}
            placeholder="conversationId"
            value={gmConvId}
            onChange={(e) => setGmConvId(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setGmResult(await getMessages(gmConvId.trim()));
              })
            }
          >
            Run getMessages
          </Button>
        </div>
        <ResultBox value={gmResult} />
      </section>

      <section>
        <h2 className="text-base font-medium text-ink mb-2">5. markConversationAsRead</h2>
        <div className="space-y-2">
          <input
            className={inputCls}
            placeholder="conversationId"
            value={mrConvId}
            onChange={(e) => setMrConvId(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setMrResult(await markConversationAsRead(mrConvId.trim()));
              })
            }
          >
            Run markConversationAsRead
          </Button>
        </div>
        <ResultBox value={mrResult} />
      </section>
    </div>
  );
}
