/**
 * Property-category caveat. Rendered:
 *   - on /categories/property (the category index for property)
 *   - on /listings/[id] when the listing's category (or its parent) is the
 *     'property' slug.
 *
 * Single source of truth for the copy — owner can edit here.
 */
export function PropertyWarningBanner() {
  return (
    <div
      role="note"
      className="rounded-lg border border-warning/30 bg-warning-bg text-warning-text p-4 text-sm"
    >
      <p className="font-semibold mb-1">
        Property listings — verification limits
      </p>
      <p className="leading-relaxed">
        ShowMePrice verifies seller identity (NIN + address + ID). We don&apos;t
        verify property titles, ownership documents, or property authenticity.
        Always inspect property and verify documents independently before any
        payment.
      </p>
    </div>
  );
}
