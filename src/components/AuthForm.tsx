"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, safeNext } from "@/lib/format";
import { saveCity } from "@/lib/location";
import { SKILLS, SKILL_LABEL, type Skill } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h1 className="font-semibold text-4xl tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted">Log in to post a game or take a spot.</p>
      <input className="field" type="email" autoComplete="email" required placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <input className="field" type="password" autoComplete="current-password" required minLength={6} placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      <p className="text-sm text-muted">
        New here?{" "}
        <Link className="text-accent" href={`/signup?next=${encodeURIComponent(next)}`}>
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { userId, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    first_name: "",
    surname: "",
    email: "",
    password: "",
    phone: "",
    city: "",
    skill: "any" as Skill,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile() {
    const supabase = createClient();
    const { error: profileError } = await supabase.rpc("save_profile", {
      p_first_name: form.first_name,
      p_surname: form.surname,
      p_phone: form.phone,
      p_city: form.city,
      p_skill: form.skill,
    });
    if (profileError) throw profileError;
    saveCity(form.city.trim());
    await refreshProfile();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!userId) {
        const { data, error: signError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
        });
        if (signError) throw signError;
        if (!data.session) {
          throw new Error("Account created, but sign-in did not start. Try logging in.");
        }
      }
      await saveProfile();
      router.push(next);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  useEffect(() => {
    if (userId && profile) router.replace(next);
  }, [userId, profile, next, router]);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h1 className="font-semibold text-4xl tracking-tight">{userId ? "Finish your profile" : "Join the court"}</h1>
      <p className="text-sm text-muted">Name, WhatsApp, and a password. No confirmation email.</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="field" required placeholder="Name" autoComplete="given-name" value={form.first_name} onChange={(event) => set("first_name", event.target.value)} />
        <input className="field" required placeholder="Surname" autoComplete="family-name" value={form.surname} onChange={(event) => set("surname", event.target.value)} />
      </div>
      {userId ? null : (
        <>
          <input className="field" type="email" required autoComplete="email" placeholder="Email" value={form.email} onChange={(event) => set("email", event.target.value)} />
          <input className="field" type="password" required minLength={6} autoComplete="new-password" placeholder="Password" value={form.password} onChange={(event) => set("password", event.target.value)} />
        </>
      )}
      <input className="field" required inputMode="tel" autoComplete="tel" placeholder="WhatsApp number" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
      <input className="field" required placeholder="Home city" value={form.city} onChange={(event) => set("city", event.target.value)} />
      <label className="block text-sm text-muted">
        Level
        <select className="field mt-2" value={form.skill} onChange={(event) => set("skill", event.target.value as Skill)}>
          {SKILLS.map((skill) => (
            <option key={skill} value={skill}>
              {SKILL_LABEL[skill]}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : userId ? "Save profile" : "Create account"}
      </button>
      {userId ? null : (
        <p className="text-sm text-muted">
          Already playing?{" "}
          <Link className="text-accent" href={`/login?next=${encodeURIComponent(next)}`}>
            Log in
          </Link>
        </p>
      )}
    </form>
  );
}
