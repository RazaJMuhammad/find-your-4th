import { describe, expect, it } from "vitest";
import {
  emailIssue,
  formReturn,
  landingPath,
  passwordIssue,
  publicAuthMessage,
  safeNext,
  withQuery,
} from "./auth";

describe("password rules", () => {
  it("accepts a long passphrase", () => {
    expect(passwordIssue("court-lights-after-eight", "player@example.com")).toBeNull();
  });

  it("rejects short, common, repeated, and email passwords", () => {
    expect(passwordIssue("short1")).toMatch(/8 characters/);
    expect(passwordIssue("password1")).toMatch(/too common/);
    expect(passwordIssue("aaaaaaaa")).toMatch(/too easy/);
    expect(passwordIssue("player@example.com", "player@example.com")).toMatch(/email/);
    expect(passwordIssue("playername", "playername@example.com")).toMatch(/email/);
  });

  it("rejects passwords longer than bcrypt can store", () => {
    expect(passwordIssue("é".repeat(40))).toMatch(/72/);
  });
});

describe("safe redirects", () => {
  it("keeps same-site paths and drops open redirects", () => {
    expect(safeNext("/games/123?from=feed")).toBe("/games/123?from=feed");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example/steal")).toBe("/");
    expect(safeNext("/%2F%2Fevil.example")).toBe("/");
    expect(safeNext("/foo\\bar")).toBe("/");
  });

  it("unwraps the callback url from an email link", () => {
    const next = safeNext("http://localhost:3000/auth/callback?next=%2Fgames%2F123", "http://localhost:3000");
    expect(next).toBe("/games/123");
  });

  it("sends accounts that have not finished their details to onboarding", () => {
    expect(landingPath("/games/1", { onboarded_at: null })).toBe("/onboarding?next=%2Fgames%2F1");
    expect(landingPath("/games/1", { terms_accepted_at: "2026-09-01T00:00:00Z" })).toBe("/onboarding?next=%2Fgames%2F1");
    expect(landingPath("/games/1", { onboarded_at: "2026-09-01T00:00:00Z" })).toBe("/games/1");
  });

  it("builds query strings without dropping existing params", () => {
    expect(withQuery("/g/abc?from=share", { error: "Try again", email: "a@b.co" })).toBe(
      "/g/abc?from=share&error=Try+again&email=a%40b.co",
    );
  });

  it("maps provider errors to messages that do not reveal which field failed", () => {
    expect(publicAuthMessage("Invalid login credentials")).toBe("Email or password is incorrect.");
    expect(emailIssue("not-an-email")).toMatch(/valid email/);
    expect(formReturn("https://evil.example", "/login")).toBe("/login");
    expect(formReturn("/g/token", "/login")).toBe("/g/token");
  });
});
