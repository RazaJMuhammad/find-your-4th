import { describe, expect, it } from "vitest";
import {
  assertClubSelection,
  assertSchedule,
  defaultDeadline,
  emptyMatch,
  HOUR,
  isLateCancel,
  placePlayer,
  promoteIfDue,
  releasePlayer,
  reliabilitySummary,
  shouldPromoteWaitlist,
  assertPost,
  cancelTier,
  eligibleForGender,
  hostCap,
  joinNeedsApproval,
  withinLevel,
} from "./rules";

const start = new Date("2026-10-01T16:00:00+02:00");
const now = new Date(start.getTime() - 6 * HOUR);

describe("club selection", () => {
  it("requires one club when the court is booked", () => {
    expect(() => assertClubSelection("booked", ["a", "b"])).toThrow(/one club/);
    expect(() => assertClubSelection("booked", ["a"])).not.toThrow();
  });

  it("allows several clubs when the court is not booked yet", () => {
    expect(() => assertClubSelection("not_booked", ["a", "b"])).not.toThrow();
    expect(() => assertClubSelection("book_when_full", ["a"])).not.toThrow();
    expect(() => assertClubSelection("not_booked", [])).toThrow(/at least one/);
  });
});

describe("schedule", () => {
  it("defaults the deadline to four hours before start", () => {
    expect(defaultDeadline(start).toISOString()).toBe(new Date(start.getTime() - 4 * HOUR).toISOString());
  });

  it("rejects a deadline closer than an hour before start", () => {
    expect(() => assertSchedule(start, new Date(start.getTime() - 30 * 60 * 1000), now)).toThrow(/1 hour/);
  });
});

describe("cancellation and waitlist", () => {
  it("treats a confirmed player as a late cancel even before the deadline", () => {
    expect(isLateCancel({ confirmed: true, now, deadline: start })).toBe(true);
    expect(isLateCancel({ confirmed: false, now, deadline: new Date(now.getTime() + HOUR) })).toBe(false);
  });

  it("promotes the oldest waiter only when the game is more than an hour away", () => {
    expect(shouldPromoteWaitlist(start, new Date(start.getTime() - 30 * 60 * 1000))).toBe(false);
    const match = emptyMatch();
    placePlayer(match, "host");
    placePlayer(match, "a");
    placePlayer(match, "b");
    placePlayer(match, "c");
    expect(match.status).toBe("full");
    match.waitlist.push("waiter");
    releasePlayer(match, "c", "late_cancel");
    expect(promoteIfDue(match, start, now)).toBe("waiter");
    expect(match.status).toBe("full");
    expect(match.outcomes).toEqual([{ playerId: "c", outcome: "late_cancel" }]);
  });

  it("does not record a miss for an early cancel", () => {
    const match = emptyMatch();
    placePlayer(match, "host");
    placePlayer(match, "a");
    releasePlayer(match, "a", null);
    expect(match.outcomes).toEqual([]);
    expect(match.status).toBe("open");
  });
});

describe("reliability", () => {
  it("stays hidden until three resolved games and keeps play-again separate", () => {
    expect(reliabilitySummary({ showUps: 2, misses: 0, playAgainYes: 4, playAgainCount: 4 }).showUpRate).toBeNull();
    const ready = reliabilitySummary({ showUps: 3, misses: 1, playAgainYes: 4, playAgainCount: 4 });
    expect(ready.showUpRate).toBe(0.75);
    expect(ready.playAgainRate).toBeNull();
    expect(reliabilitySummary({ showUps: 3, misses: 1, playAgainYes: 4, playAgainCount: 5 }).playAgainRate).toBe(0.8);
  });
});

describe("level window", () => {
  it("includes one step either side", () => {
    expect(withinLevel("intermediate", "intermediate_plus")).toBe(true);
    expect(withinLevel("beginner", "advanced")).toBe(false);
  });
});

describe("mvp rules", () => {
  it("asks for approval when several spots are open or the level is outside", () => {
    expect(joinNeedsApproval({ openSpots: 1, inRange: true, hostMode: "instant" })).toBe(false);
    expect(joinNeedsApproval({ openSpots: 2, inRange: true, hostMode: "instant" })).toBe(true);
    expect(joinNeedsApproval({ openSpots: 1, inRange: false, hostMode: "instant" })).toBe(true);
  });

  it("tiers a withdrawal by how close the game is", () => {
    const starts = new Date("2026-10-02T18:00:00+02:00");
    expect(cancelTier(starts, new Date(starts.getTime() - 30 * HOUR))).toBe("free");
    expect(cancelTier(starts, new Date(starts.getTime() - 10 * HOUR))).toBe("late");
    expect(cancelTier(starts, new Date(starts.getTime() - 2 * HOUR))).toBe("no_show");
    expect(cancelTier(starts, new Date(starts.getTime() - 2 * HOUR), new Date(starts.getTime() - HOUR))).toBe("free");
  });

  it("limits a new host to one active game", () => {
    expect(hostCap(HOUR)).toBe(1);
    expect(hostCap(4 * 24 * HOUR)).toBe(3);
  });

  it("requires one club when the court is held and a two-hour window when it is a proposal", () => {
    const start = new Date("2026-10-02T18:00:00+02:00");
    expect(() => assertPost({ mode: "court", clubIds: ["a", "b"], startsAt: start, endsAt: null, openSpots: 1, levelMin: 2, levelMax: 4, note: "" })).toThrow(/one club/);
    expect(() => assertPost({ mode: "proposal", clubIds: ["a"], startsAt: start, endsAt: new Date(start.getTime() + HOUR), openSpots: 2, levelMin: 2, levelMax: 4, note: "" })).toThrow(/2 hours/);
  });

  it("keeps women's games to players who said they are women", () => {
    expect(eligibleForGender("woman", "women")).toBe(true);
    expect(eligibleForGender("man", "women")).toBe(false);
    expect(eligibleForGender("man", "open")).toBe(true);
  });
});
