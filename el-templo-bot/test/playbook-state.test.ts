/**
 * Unit tests for playbook state memory (Redis-backed, 6h TTL).
 *
 * Mocks the redis module with an in-memory Map-based store and a TTL
 * tracker so we can assert the EX value passed to `redis.set`. Pattern
 * mirrors `memory-session.test.ts` for consistency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mock state (must be defined before vi.mock) ─────────────────────

const mockStore = new Map<string, string>();
const mockTtls = new Map<string, number>();
const mockState = { available: true };

const mockGetSpy = vi.fn(async (key: string) => {
  return mockStore.get(key) ?? null;
});

const mockSetSpy = vi.fn(
  async (key: string, value: string, _ex: string, ttl: number) => {
    mockStore.set(key, value);
    mockTtls.set(key, ttl);
    return "OK";
  },
);

const mockDelSpy = vi.fn(async (key: string) => {
  mockStore.delete(key);
  mockTtls.delete(key);
  return 1;
});

const mockTtlSpy = vi.fn(async (key: string) => {
  return mockTtls.get(key) ?? -2;
});

// ─── Mock Redis module ──────────────────────────────────────────────────────

vi.mock("../src/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockGetSpy(...(args as [string])),
    set: (...args: unknown[]) =>
      mockSetSpy(...(args as [string, string, string, number])),
    del: (...args: unknown[]) => mockDelSpy(...(args as [string])),
    ttl: (...args: unknown[]) => mockTtlSpy(...(args as [string])),
  },
  isRedisAvailable: () => mockState.available,
}));

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

// ─── Import after mocks ─────────────────────────────────────────────────────

import {
  getPlaybookState,
  setPlaybookState,
  deletePlaybookState,
  PLAYBOOK_STATE_TTL,
} from "../src/memory/playbook-state";
import type { PlaybookSessionState } from "../src/playbooks/types";

// ─── Tests ──────────────────────────────────────────────────────────────────

const PHONE = "5491100000001";
const KEY = `wa:playbook:${PHONE}`;

function makeState(
  overrides: Partial<PlaybookSessionState> = {},
): PlaybookSessionState {
  return {
    activePlaybook: "PB1",
    currentStage: "PB1.E1A",
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("Playbook State Memory", () => {
  beforeEach(() => {
    mockStore.clear();
    mockTtls.clear();
    mockState.available = true;
    vi.clearAllMocks();

    // Restore default implementations after clearAllMocks
    mockGetSpy.mockImplementation(async (key: string) => {
      return mockStore.get(key) ?? null;
    });
    mockSetSpy.mockImplementation(
      async (key: string, value: string, _ex: string, ttl: number) => {
        mockStore.set(key, value);
        mockTtls.set(key, ttl);
        return "OK";
      },
    );
    mockDelSpy.mockImplementation(async (key: string) => {
      mockStore.delete(key);
      mockTtls.delete(key);
      return 1;
    });
    mockTtlSpy.mockImplementation(async (key: string) => {
      return mockTtls.get(key) ?? -2;
    });
  });

  // ── getPlaybookState ────────────────────────────────────────────────────

  describe("getPlaybookState", () => {
    it("returns null when Redis is unavailable", async () => {
      mockState.available = false;
      const result = await getPlaybookState(PHONE);
      expect(result).toBeNull();
      expect(mockGetSpy).not.toHaveBeenCalled();
    });

    it("returns null on miss (no key set)", async () => {
      const result = await getPlaybookState(PHONE);
      expect(result).toBeNull();
      expect(mockGetSpy).toHaveBeenCalledWith(KEY);
    });

    it("returns null on Redis error (silent degradation)", async () => {
      mockGetSpy.mockRejectedValueOnce(new Error("Connection refused"));
      const result = await getPlaybookState(PHONE);
      expect(result).toBeNull();
    });
  });

  // ── setPlaybookState ────────────────────────────────────────────────────

  describe("setPlaybookState", () => {
    it("persists state and round-trips through getPlaybookState", async () => {
      const state = makeState();
      await setPlaybookState(PHONE, state);

      const fetched = await getPlaybookState(PHONE);
      expect(fetched).toEqual(state);
    });

    it("uses the wa:playbook: key prefix", async () => {
      await setPlaybookState(PHONE, makeState());
      expect(mockSetSpy).toHaveBeenCalledWith(
        KEY,
        expect.any(String),
        "EX",
        PLAYBOOK_STATE_TTL,
      );
    });

    it("sets EX TTL to PLAYBOOK_STATE_TTL on every write", async () => {
      await setPlaybookState(PHONE, makeState());
      const ttl = await mockTtlSpy(KEY);
      // Allow a tiny window in case the implementation ever decrements
      expect(ttl).toBeGreaterThanOrEqual(PLAYBOOK_STATE_TTL - 5);
      expect(ttl).toBeLessThanOrEqual(PLAYBOOK_STATE_TTL);
    });

    it("overwrites a previous state on repeated writes", async () => {
      await setPlaybookState(PHONE, makeState({ currentStage: "PB1.E1A" }));
      await setPlaybookState(PHONE, makeState({ currentStage: "PB1.E2A" }));

      const fetched = await getPlaybookState(PHONE);
      expect(fetched?.currentStage).toBe("PB1.E2A");
    });

    it("silently returns when Redis is unavailable", async () => {
      mockState.available = false;
      await setPlaybookState(PHONE, makeState());
      expect(mockSetSpy).not.toHaveBeenCalled();
    });

    it("silently returns on Redis error (does not throw)", async () => {
      mockSetSpy.mockRejectedValueOnce(new Error("Connection refused"));
      await expect(
        setPlaybookState(PHONE, makeState()),
      ).resolves.toBeUndefined();
    });
  });

  // ── deletePlaybookState ─────────────────────────────────────────────────

  describe("deletePlaybookState", () => {
    it("deletes an existing state", async () => {
      await setPlaybookState(PHONE, makeState());
      expect(await getPlaybookState(PHONE)).not.toBeNull();

      await deletePlaybookState(PHONE);
      expect(await getPlaybookState(PHONE)).toBeNull();
    });

    it("silently returns when Redis is unavailable", async () => {
      mockState.available = false;
      await deletePlaybookState(PHONE);
      expect(mockDelSpy).not.toHaveBeenCalled();
    });

    it("silently returns on Redis error (does not throw)", async () => {
      mockDelSpy.mockRejectedValueOnce(new Error("Connection refused"));
      await expect(deletePlaybookState(PHONE)).resolves.toBeUndefined();
    });
  });

  // ── Constants ───────────────────────────────────────────────────────────

  describe("constants", () => {
    it("PLAYBOOK_STATE_TTL is 6 hours (21600 seconds)", () => {
      expect(PLAYBOOK_STATE_TTL).toBe(21_600);
    });

    it("matches the SESSION_TTL value (both expire together)", async () => {
      const { SESSION_TTL } = await import("../src/memory/session");
      expect(PLAYBOOK_STATE_TTL).toBe(SESSION_TTL);
    });
  });
});
