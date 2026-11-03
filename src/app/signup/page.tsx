import { Suspense } from "react";
import { SignupForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <SignupForm />
    </Suspense>
  );
}
