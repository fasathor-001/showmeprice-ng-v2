# WORKFLOW.md

How the planner, owner, and agent collaborate.

## The three roles

- **Owner** — the human running the project. Pushes to GitHub. Applies migrations. Runs live verification. Makes business decisions.
- **Planner** — a Claude session that writes specs, reviews reports, decides priorities, and tracks phase boundaries. Never executes code directly.
- **Agent** — a Claude Code (or similar) session that executes specs. Reads documents, writes code, runs tests, commits. Never decides what to build.

## The loop

1. Planner writes a spec as a single markdown document.
2. Owner pastes the spec into a fresh agent session.
3. Agent reads `CLAUDE.md` and the relevant docs first, then executes the spec step by step.
4. Agent stops at the hard stop and writes a structured report.
5. Owner pastes the report back to the planner.
6. Planner reviews, asks for clarification or live verification if needed.
7. Owner runs live verification on the deployed site.
8. Owner reports back to the planner.
9. Planner writes the next spec, or asks the agent to fix a finding.

## Why fresh agent sessions per phase

Agent context windows fill up. Each phase starts fresh, with `CLAUDE.md` as the entry point.

## What goes in a spec

- A "Why" paragraph
- Hard constraints
- Step 0 (read existing code before writing)
- Implementation steps
- Verification criteria
- A commit message template
- A hard stop and report format

## What goes in a report

- Commits made (hash + subject)
- Verification results
- Things the agent noticed but didn't fix
- Questions / flags for the planner
- Build gate status
- "Ready to push" or "needs planner decision"

## Phase boundaries

A phase is done when all planned commits are in, build gate green, live verification passes, and the next phase is scoped by the planner. The owner enforces phase boundaries.

## Conflict resolution

If the agent disagrees with the spec, the agent **stops and surfaces the disagreement** through the owner. The agent does not silently implement a different design.

If the owner disagrees with the planner, they say so. The planner adjusts.
