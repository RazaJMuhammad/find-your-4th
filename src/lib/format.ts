import type { Skill } from "@/lib/types";

function clock(date: Date) {
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function formatWhen(iso: string, endsAt?: string | null) {
  const date = new Date(iso);
  const end = endsAt ? new Date(endsAt) : null;
  const time =
    end && !Number.isNaN(end.getTime()) && Math.abs(end.getTime() - date.getTime()) >= 60_000
      ? `${clock(date)}–${clock(end)}`
      : clock(date);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDate = new Date();
  const today = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime();
  if (day === today) return `Today · ${time}`;
  if (day === today + 86_400_000) return `Tomorrow · ${time}`;
  const label = date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  return `${label} · ${time}`;
}

export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function asRating(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const rating = Number(value);
    return Number.isFinite(rating) ? rating : null;
  }
  return null;
}

export function formatRating(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "No level";
  return value.toFixed(2);
}

export function playtomicRatingDraft(value: string) {
  const cleaned = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const whole = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/\D/g, "").slice(0, 1);
  if (dot === -1) return whole;
  const fraction = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

export function parsePlaytomicRating(value: string) {
  const rating = Number(playtomicRatingDraft(value));
  if (!Number.isFinite(rating) || rating < 0 || rating > 7) {
    throw new Error("Enter a Playtomic level from 0 to 7.");
  }
  return Math.round(rating * 100) / 100;
}

export function personName(person: { first_name?: string | null; surname?: string | null } | null | undefined) {
  const name = `${person?.first_name ?? ""} ${person?.surname ?? ""}`.trim();
  return name || "Player";
}

export function skillLabel(skill: Skill) {
  if (skill === "any") return "Any level";
  if (skill === "beginner") return "Beginner";
  if (skill === "intermediate") return "Intermediate";
  return "Advanced";
}

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: string }).message);
  }
  return "Something went wrong. Try again.";
}

export function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
