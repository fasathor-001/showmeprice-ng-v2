# CLAUDE.md — Required reading for every agent session

You are working on ShowMePrice.ng v2. Before you do anything in this codebase, read these files in this order:

1. This file
2. `docs/agent-handoff.md` — operating manual (read right after this file)
3. `AGENT.md` — discipline rules
4. `ARCHITECTURE.md` — what the system looks like
5. `DECISIONS.md` — locked decisions, do not relitigate
6. `ROADMAP.md` — where we are in the phased build
7. `KNOWN_ISSUES.md` — open bugs
8. `MEMORY.md` — lessons learned, project-specific patterns
9. `docs/RUNBOOK.md` — how to perform common operations
10. `docs/WORKFLOW.md` — how the planner ↔ owner ↔ agent loop works

## What ShowMePrice.ng is

A Nigerian marketplace where verified sellers post products with real prices and buyers contact them directly via WhatsApp or phone. The site exists to solve the "DM for price" problem on Instagram and similar channels.

**Conversion event:** the contact-reveal tap (WhatsApp or phone). Not a checkout.
**Monetisation:** seller tier subscriptions (Pro+), not a per-transaction cut.
**Currency:** Naira (NGN) only.
**Users:** buyer, seller (superset of buyer), admin.

## Step 0 before code

Every session, every fix, every feature: read the relevant existing code before writing. Skipping this is the most common failure mode and has cost deploy cycles repeatedly.
