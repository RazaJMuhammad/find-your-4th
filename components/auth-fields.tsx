"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function PasswordField({
  name,
  label,
  autoComplete,
  describedBy,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      {label}
      <span className="flex gap-2">
        <input
          className="min-w-0 flex-1"
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          minLength={autoComplete === "new-password" ? 8 : undefined}
          maxLength={72}
          aria-describedby={describedBy}
        />
        <button
          className="btn btn-quiet shrink-0 px-3"
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

export function SubmitButton({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn w-full" type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Honeypot() {
  return (
    <div className="absolute left-[-9999px]" aria-hidden="true">
      <label>
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
