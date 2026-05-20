"use client";

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  productId: string;
}

/**
 * Sprint 3 / Gap B — asymmetric confirmation.
 *
 * Marking a listing sold is the destructive-feeling direction (it disappears
 * from buyer search), so we gate it behind a native confirm(). Reactivation is
 * the recoverable direction and ships as a plain one-click form, so it lives
 * inline in the dashboard rather than here.
 */
export function MarkSoldButton({ action, productId }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Mark this listing as sold? It will no longer appear in marketplace search."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="status" value="sold" />
      <button
        type="submit"
        className="text-ink-600 hover:text-ink font-medium"
      >
        Mark sold
      </button>
    </form>
  );
}
