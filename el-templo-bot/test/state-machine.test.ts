/**
 * Unit tests for client state machine.
 *
 * Mocks the DB execute function to return controlled results
 * for user/subscription/attendance queries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Suppress pino log output in tests
vi.mock("pino", () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => noopLogger),
  };
  return { default: () => noopLogger };
});

import {
  determineClientState,
  updateConversationState,
} from "../src/state/machine";

// ─── Helpers ────────────────────────────────────────────────────────────────

type ExecuteResult = [unknown[], unknown];

function createMockDb(results: ExecuteResult[]) {
  let callIndex = 0;
  return {
    execute: vi.fn(async () => {
      const result = results[callIndex] ?? [[], []];
      callIndex++;
      return result;
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Client State Machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("determineClientState", () => {
    it("returns 'lead' when phone not in users table", async () => {
      const db = createMockDb([
        [[], []], // user query: no results
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("lead");
      expect(result.userId).toBeNull();
    });

    it("returns 'lead' when user exists but has no subscriptions", async () => {
      const db = createMockDb([
        [[{ id: 42, first_name: "Juan", is_active: 1 }], []], // user found
        [[], []], // no subscriptions
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("lead");
      expect(result.userId).toBe(42);
    });

    it("returns 'active_member' when user has active subscription with recent attendance", async () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      const db = createMockDb([
        [[{ id: 42, first_name: "Juan", is_active: 1 }], []], // user found
        [
          [
            {
              subscription_status: "active",
              end_date: futureDate.toISOString().split("T")[0],
              is_trial: 0,
            },
          ],
          [],
        ], // active subscription
        [[{ cnt: 5 }], []], // 5 attendances in last 30 days
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("active_member");
      expect(result.userId).toBe(42);
    });

    it("returns 'inactive_member' when active subscription but no attendance in 30 days", async () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      const db = createMockDb([
        [[{ id: 42, first_name: "Juan", is_active: 1 }], []], // user found
        [
          [
            {
              subscription_status: "active",
              end_date: futureDate.toISOString().split("T")[0],
              is_trial: 0,
            },
          ],
          [],
        ], // active subscription
        [[{ cnt: 0 }], []], // 0 attendances in last 30 days
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("inactive_member");
      expect(result.userId).toBe(42);
    });

    it("returns 'expired_member' when active subscription has end_date in the past", async () => {
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 1);

      const db = createMockDb([
        [[{ id: 42, first_name: "Juan", is_active: 1 }], []], // user found
        [
          [
            {
              subscription_status: "active",
              end_date: pastDate.toISOString().split("T")[0],
              is_trial: 0,
            },
          ],
          [],
        ], // subscription with past end_date
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("expired_member");
      expect(result.userId).toBe(42);
    });

    it("returns 'trial' when user only has trial subscriptions", async () => {
      const db = createMockDb([
        [[{ id: 42, first_name: "Maria", is_active: 1 }], []], // user found
        [
          [
            {
              subscription_status: "expired",
              end_date: "2025-01-01",
              is_trial: 1,
            },
          ],
          [],
        ], // only trial sub, expired
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("trial");
      expect(result.userId).toBe(42);
    });

    it("returns 'expired_member' when user has non-trial expired subscriptions", async () => {
      const db = createMockDb([
        [[{ id: 42, first_name: "Carlos", is_active: 1 }], []], // user found
        [
          [
            {
              subscription_status: "cancelled",
              end_date: "2025-01-01",
              is_trial: 0,
            },
            {
              subscription_status: "expired",
              end_date: "2024-06-01",
              is_trial: 0,
            },
          ],
          [],
        ], // non-trial expired subs
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("expired_member");
      expect(result.userId).toBe(42);
    });

    it("returns 'inactive_member' when subscription is paused", async () => {
      const db = createMockDb([
        [[{ id: 42, first_name: "Ana", is_active: 1 }], []], // user found
        [
          [
            {
              subscription_status: "paused",
              end_date: "2026-06-01",
              is_trial: 0,
            },
          ],
          [],
        ], // paused subscription
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("inactive_member");
      expect(result.userId).toBe(42);
    });

    it("returns 'active_member' when subscription has null end_date (unlimited) and has attendance", async () => {
      const db = createMockDb([
        [[{ id: 42, first_name: "Luis", is_active: 1 }], []], // user found
        [[{ subscription_status: "active", end_date: null, is_trial: 0 }], []], // active subscription, no end_date
        [[{ cnt: 3 }], []], // 3 attendances
      ]);

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("active_member");
      expect(result.userId).toBe(42);
    });

    it("returns 'lead' on DB error (safe fallback)", async () => {
      const db = {
        execute: vi.fn(async () => {
          throw new Error("Connection refused");
        }),
      };

      const result = await determineClientState("5491100000001", db as never);
      expect(result.state).toBe("lead");
      expect(result.userId).toBeNull();
    });
  });

  describe("updateConversationState", () => {
    it("executes UPDATE SQL with correct parameters", async () => {
      const db = createMockDb([
        [[], []], // UPDATE result
      ]);

      await updateConversationState(123, "active_member", db as never);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it("silently handles DB errors", async () => {
      const db = {
        execute: vi.fn(async () => {
          throw new Error("Connection refused");
        }),
      };

      // Should not throw
      await expect(
        updateConversationState(123, "active_member", db as never),
      ).resolves.toBeUndefined();
    });
  });
});
