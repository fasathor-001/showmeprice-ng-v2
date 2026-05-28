"use client";

// Settings horizontal tab strip with active-state highlight.
//
// Lives next to layout.tsx (server) — the split is intentional:
//   - layout.tsx (server) does the auth gate + shared chrome (heading,
//     "← Dashboard" breadcrumb, <Container> wrapper).
//   - SettingsNav (client) handles the only piece that needs the URL —
//     active-tab styling via usePathname().
//
// Tabs are declared inline (3 total, small enough to not warrant a config
// file). startsWith() matches deeper paths under each tab — e.g. a future
// /settings/account/edit would still highlight Account.

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/security", label: "Security" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mb-6 border-b border-neutral-200"
      aria-label="Settings sections"
    >
      <div className="flex gap-1 -mb-px">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname?.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors " +
                (isActive
                  ? "border-teal-600 text-ink"
                  : "border-transparent text-ink-600 hover:text-ink hover:border-neutral-300")
              }
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
