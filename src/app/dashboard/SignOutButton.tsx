"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { signOutAction } from "@/app/(auth)/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Inner />
    </form>
  );
}

function Inner() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
