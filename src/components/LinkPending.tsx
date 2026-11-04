"use client";

import { useLinkStatus } from "next/link";

export function LinkPending({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={`link-pending ${pending ? "is-pending" : ""}`} role="status" aria-live="polite" aria-hidden={pending ? undefined : true}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span className="font-semibold">{label}</span>
        </>
      ) : null}
    </span>
  );
}
