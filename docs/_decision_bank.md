We just made a decision that needs banking. Draft the DECISIONS.md entry now per the established format.

**Find the next available D-number** (read latest D-XXX in DECISIONS.md and increment by 1).

**Decision entry format:**

## D-XXX: <Decision title — short, specific>

**Date:** YYYY-MM-DD
**Status:** Locked
**Supersedes:** [D-YYY if this replaces an earlier decision, else "None"]
**Related:** [Other D-numbers this connects to, if any]

### Context
[2-4 sentences: what problem prompted this decision? what alternatives were considered?]

### Decision
[The actual decision in 1-2 sentences. Specific and actionable. NOT aspirational.]

### Rationale
[Why this decision over alternatives. Include the trade-offs accepted.]

### Implications
- [Bullet list of concrete implications: what code changes, what UX changes, what new patterns]
- [Be specific — vague implications mean the decision isn't actually decided]

### Out of scope
[What this decision does NOT cover. Prevents future drift / overreach.]

---

Show me the proposed entry for review BEFORE appending to DECISIONS.md.

After I approve:
- Append to the end of DECISIONS.md
- If the decision implies updates to other canonical files (MEMORY.md lessons, KNOWN_ISSUES.md entries, schema notes), surface those alongside
- Single coherent commit covering the decision banking + any directly-implied updates
- Commit message: "decisions: bank D-XXX <short title>"