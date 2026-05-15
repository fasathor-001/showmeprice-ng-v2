"use client";

import { useState } from "react";
import { deleteListingAction } from "@/app/(auth)/actions";

interface Props {
  productId: string;
  title: string;
}

export function DeleteListingButton({ productId, title }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <form action={deleteListingAction} className="inline-flex items-center gap-1">
        <input type="hidden" name="productId" value={productId} />
        <button
          type="submit"
          className="text-danger-text hover:underline font-medium"
          aria-label={`Confirm delete ${title}`}
        >
          Confirm?
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-ink-600 hover:text-ink"
          aria-label="Cancel delete"
        >
          ×
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-danger-text hover:underline font-medium"
      aria-label={`Delete ${title}`}
    >
      Delete
    </button>
  );
}
