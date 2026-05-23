import { describe, it, expect } from "vitest";
import {
  formatConversationTime,
  formatLastActive,
  formatThreadDateDivider,
} from "./time";

// Frozen "now" for deterministic assertions. 2026-05-23 (Saturday) 14:00 local.
const NOW = new Date(2026, 4, 23, 14, 0, 0); // months are 0-indexed: 4 = May

describe("formatConversationTime", () => {
  it("renders today's timestamps as HH:mm (24h)", () => {
    const t = new Date(2026, 4, 23, 9, 7).toISOString();
    expect(formatConversationTime(t, NOW)).toBe("09:07");
  });

  it("renders yesterday as 'Yesterday'", () => {
    const t = new Date(2026, 4, 22, 22, 0).toISOString();
    expect(formatConversationTime(t, NOW)).toBe("Yesterday");
  });

  it("renders 2–6 days ago as short weekday", () => {
    const t = new Date(2026, 4, 20, 10, 0).toISOString(); // 3 days back → Wed
    const out = formatConversationTime(t, NOW);
    // Weekday string is locale-dependent — assert shape, not literal.
    expect(out).toMatch(/^[A-Z][a-z]{2}$/);
  });

  it("renders this year's older timestamps as 'Mon D'", () => {
    const t = new Date(2026, 0, 15, 10, 0).toISOString(); // Jan 15 — 4 months back
    const out = formatConversationTime(t, NOW);
    expect(out).toMatch(/Jan/); // locale-default for English; rough check
  });

  it("renders last year as 'Mon YYYY'", () => {
    const t = new Date(2025, 2, 10).toISOString();
    const out = formatConversationTime(t, NOW);
    expect(out).toMatch(/2025/);
  });

  it("returns empty string for null / invalid input", () => {
    expect(formatConversationTime(null, NOW)).toBe("");
    expect(formatConversationTime(undefined, NOW)).toBe("");
    expect(formatConversationTime("not-an-iso", NOW)).toBe("");
  });
});

describe("formatLastActive", () => {
  it("returns 'Active now' for under 5 minutes", () => {
    const t = new Date(2026, 4, 23, 13, 58).toISOString(); // 2 min ago
    expect(formatLastActive(t, NOW)).toBe("Active now");
  });

  it("returns minutes for 5–59 minutes", () => {
    const t = new Date(2026, 4, 23, 13, 37).toISOString(); // 23 min ago
    expect(formatLastActive(t, NOW)).toBe("Active 23m ago");
  });

  it("returns hours for 1–23 hours ago", () => {
    const t = new Date(2026, 4, 23, 9, 0).toISOString(); // 5h ago
    expect(formatLastActive(t, NOW)).toBe("Active 5h ago");
  });

  it("returns 'Active yesterday' for 1 day ago", () => {
    const t = new Date(2026, 4, 22, 14, 0).toISOString();
    expect(formatLastActive(t, NOW)).toBe("Active yesterday");
  });

  it("returns 'Active N days ago' for 2–6 days", () => {
    const t = new Date(2026, 4, 20, 14, 0).toISOString(); // 3 days
    expect(formatLastActive(t, NOW)).toBe("Active 3 days ago");
  });

  it("returns 'Active <date>' for older (locale-formatted)", () => {
    const t = new Date(2026, 4, 1).toISOString(); // 22 days ago
    const out = formatLastActive(t, NOW);
    // Locale-dependent format: en-US "May 1", en-GB "1 May" / "01 May", etc.
    // Just confirm prefix + month token are present — digit shape varies.
    expect(out).toMatch(/^Active /);
    expect(out).toMatch(/May/);
  });

  it("returns empty string for null / invalid input", () => {
    expect(formatLastActive(null, NOW)).toBe("");
    expect(formatLastActive(undefined, NOW)).toBe("");
    expect(formatLastActive("not-an-iso", NOW)).toBe("");
  });

  it("handles clock skew (future timestamp) gracefully", () => {
    const t = new Date(2026, 4, 23, 14, 30).toISOString(); // 30 min in future
    expect(formatLastActive(t, NOW)).toBe("Active now");
  });
});

describe("formatThreadDateDivider", () => {
  it("returns 'Today' for same-day timestamps", () => {
    const t = new Date(2026, 4, 23, 9, 0).toISOString();
    expect(formatThreadDateDivider(t, NOW)).toBe("Today");
  });

  it("returns 'Yesterday' for previous-day timestamps", () => {
    const t = new Date(2026, 4, 22, 18, 0).toISOString();
    expect(formatThreadDateDivider(t, NOW)).toBe("Yesterday");
  });

  it("returns '<Weekday>, <Date>' for 2–6 days ago", () => {
    const t = new Date(2026, 4, 20, 10, 0).toISOString(); // Wed 3d back
    const out = formatThreadDateDivider(t, NOW);
    // Locale-tolerant: must contain a 3-letter weekday + a comma + a month token.
    expect(out).toMatch(/^[A-Z][a-z]{2}, /);
    expect(out).toMatch(/May/);
  });

  it("returns '<short date>' for older this-year timestamps", () => {
    const t = new Date(2026, 0, 15, 10, 0).toISOString(); // Jan 15
    const out = formatThreadDateDivider(t, NOW);
    expect(out).not.toMatch(/^[A-Z][a-z]{2}, /); // no weekday prefix
    expect(out).toMatch(/Jan/);
    expect(out).not.toMatch(/2026/); // current year omitted
  });

  it("includes year for cross-year timestamps", () => {
    const t = new Date(2025, 2, 10).toISOString(); // Mar 10, 2025
    const out = formatThreadDateDivider(t, NOW);
    expect(out).toMatch(/2025/);
  });

  it("returns empty string for null / invalid input", () => {
    expect(formatThreadDateDivider(null, NOW)).toBe("");
    expect(formatThreadDateDivider(undefined, NOW)).toBe("");
    expect(formatThreadDateDivider("not-an-iso", NOW)).toBe("");
  });
});
