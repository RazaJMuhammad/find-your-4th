export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;
export const RECOVERY_COOKIE = "fy4_recovery";
export const RECOVERY_MAX_AGE = 60 * 15;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyui",
  "qwerty123",
  "letmein1",
  "welcome1",
  "iloveyou",
  "abc12345",
  "padel123",
  "padel1234",
  "findyour4th",
]);

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function emailIssue(email: string) {
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

export function passwordIssue(password: string, email = "") {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "Use at most 72 characters.";
  if (/^(.)\1+$/.test(password)) return "That password is too easy to guess. Choose another.";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "That password is too common. Choose another.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if ((email && lower === email.toLowerCase()) || (local.length >= 4 && lower === local)) {
    return "Do not use your email as your password.";
  }
  return null;
}

export function publicAuthMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) return "Email or password is incorrect.";
  if (lower.includes("email not confirmed")) return "Confirm your email first. Check your inbox, then sign in.";
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "An account with this email already exists. Sign in, or reset your password.";
  }
  if (lower.includes("weak") || lower.includes("pwned") || lower.includes("leaked") || lower.includes("breached")) {
    return "That password is too easy to guess. Choose a longer one you have not used elsewhere.";
  }
  if (lower.includes("rate") || lower.includes("too many") || lower.includes("only request this") || lower.includes("security purposes")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (lower.includes("different from the old")) return "Choose a different password from your current one.";
  return "Something went wrong. Try again.";
}

export function withQuery(path: string, params: Record<string, string | undefined>) {
  const hashIndex = path.indexOf("#");
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const qIndex = withoutHash.indexOf("?");
  const pathname = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
  const query = new URLSearchParams(qIndex >= 0 ? withoutHash.slice(qIndex + 1) : "");
  for (const [key, value] of Object.entries(params)) {
    if (!value) query.delete(key);
    else query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function allowedOrigin(origin: string, requestOrigin?: string) {
  if (requestOrigin && origin === requestOrigin) return true;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (site && origin === site) return true;
  return origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000";
}

function decodePath(value: string) {
  let current = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      return null;
    }
  }
  return current;
}

export function safeNext(value: string | null | undefined, requestOrigin?: string) {
  const fallback = "/";
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F\\]/.test(trimmed)) return fallback;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    const decoded = decodePath(trimmed);
    if (!decoded || !decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
    const pathOnly = decoded.split("?")[0] ?? decoded;
    if (/[\u0000-\u001F\u007F\\]/.test(decoded) || pathOnly.includes("://")) return fallback;
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    if (!allowedOrigin(url.origin, requestOrigin)) return fallback;
    if (url.pathname === "/auth/callback" || url.pathname === "/auth/confirm") {
      return safeNext(url.searchParams.get("next"), url.origin);
    }
    return safeNext(`${url.pathname}${url.search}`, url.origin);
  } catch {
    return fallback;
  }
}

export function landingPath(next: string, account: unknown) {
  const dest = safeNext(next);
  if (hasOnboarded(account) || dest.startsWith("/onboarding")) return dest;
  return `/onboarding?next=${encodeURIComponent(dest)}`;
}

function hasOnboarded(account: unknown) {
  if (!account || typeof account !== "object") return false;
  const onboarded = (account as { onboarded_at?: unknown }).onboarded_at;
  return typeof onboarded === "string" && onboarded.length > 0;
}

export function isRecoveryNext(path: string) {
  return path === "/reset-password" || path.startsWith("/reset-password?");
}

export function recoveryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: RECOVERY_MAX_AGE,
  };
}

export function formReturn(value: unknown, fallback: string) {
  const requested = String(value ?? "").trim();
  if (!requested) return fallback;
  const safe = safeNext(requested);
  if (safe === "/") return fallback;
  return safe;
}
