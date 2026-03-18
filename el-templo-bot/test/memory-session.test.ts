/**
 * Unit tests for session context memory (Redis-backed).
 *
 * Mocks the redis module to provide an in-memory Map-based store
 * with controllable availability flag.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mock state (must be defined before vi.mock) ─────────────────────

const mockStore = new Map<string, string>();
const mockState = { available: true };

const mockGetSpy = vi.fn(async (key: string) => {
  return mockStore.get(key) ?? null;
});

const mockSetSpy = vi.fn(
  async (key: string, value: string, _ex: string, _ttl: number) => {
    mockStore.set(key, value);
    return "OK";
  },
);

const mockDelSpy = vi.fn(async (key: string) => {
  mockStore.delete(key);
  return 1;
});

// ─── Mock Redis module ──────────────────────────────────────────────────────

vi.mock("../src/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockGetSpy(...(args as [string])),
    set: (...args: unknown[]) =>
      mockSetSpy(...(args as [string, string, string, number])),
    del: (...args: unknown[]) => mockDelSpy(...(args as [string])),
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
  getSession,
  updateSession,
  deleteSession,
  SESSION_TTL,
  MAX_SESSION_MESSAGES,
} from "../src/memory/session";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Session Context Memory", () => {
  beforeEach(() => {
    mockStore.clear();
    mockState.available = true;
    vi.clearAllMocks();

    // Restore default implementations after clearAllMocks
    mockGetSpy.mockImplementation(async (key: string) => {
      return mockStore.get(key) ?? null;
    });
    mockSetSpy.mockImplementation(
      async (key: string, value: string, _ex: string, _ttl: number) => {
        mockStore.set(key, value);
        return "OK";
      },
    );
    mockDelSpy.mockImplementation(async (key: string) => {
      mockStore.delete(key);
      return 1;
    });
  });

  // ── getSession ──────────────────────────────────────────────────────────

  describe("getSession", () => {
    it("returns null when Redis is unavailable", async () => {
      mockState.available = false;
      const result = await getSession("5491100000001");
      expect(result).toBeNull();
      // Should not attempt Redis call
      expect(mockGetSpy).not.toHaveBeenCalled();
    });

    it("returns null when no session exists", async () => {
      const result = await getSession("5491100000001");
      expect(result).toBeNull();
    });

    it("returns session data when it exists", async () => {
      const sessionData = {
        messages: [
          { role: "user", content: "Hola", timestamp: 1000 },
          {
            role: "assistant",
            content: "Hola! Como puedo ayudarte?",
            timestamp: 1001,
          },
        ],
        updatedAt: 1001,
      };
      mockStore.set("wa:session:5491100000001", JSON.stringify(sessionData));

      const result = await getSession("5491100000001");
      expect(result).toEqual(sessionData);
    });

    it("returns null on Redis error (silent degradation)", async () => {
      mockGetSpy.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getSession("5491100000001");
      expect(result).toBeNull();
    });
  });

  // ── updateSession ───────────────────────────────────────────────────────

  describe("updateSession", () => {
    it("creates a new session with one message", async () => {
      await updateSession("5491100000001", "user", "Hola");

      const stored = mockStore.get("wa:session:5491100000001");
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].role).toBe("user");
      expect(parsed.messages[0].content).toBe("Hola");
      expect(parsed.messages[0].timestamp).toBeTypeOf("number");
    });

    it("appends messages to an existing session", async () => {
      await updateSession("5491100000001", "user", "Hola");
      await updateSession(
        "5491100000001",
        "assistant",
        "Hola! Como puedo ayudarte?",
      );

      const stored = mockStore.get("wa:session:5491100000001");
      const parsed = JSON.parse(stored!);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0].content).toBe("Hola");
      expect(parsed.messages[1].content).toBe("Hola! Como puedo ayudarte?");
    });

    it("trims to last MAX_SESSION_MESSAGES when cap exceeded", async () => {
      // Add 25 messages
      for (let i = 0; i < 25; i++) {
        const role = i % 2 === 0 ? "user" : "assistant";
        await updateSession(
          "5491100000001",
          role as "user" | "assistant",
          `Message ${i}`,
        );
      }

      const stored = mockStore.get("wa:session:5491100000001");
      const parsed = JSON.parse(stored!);
      expect(parsed.messages).toHaveLength(MAX_SESSION_MESSAGES);

      // Should keep messages 5-24 (last 20)
      expect(parsed.messages[0].content).toBe("Message 5");
      expect(parsed.messages[MAX_SESSION_MESSAGES - 1].content).toBe(
        "Message 24",
      );
    });

    it("sets TTL on each update", async () => {
      await updateSession("5491100000001", "user", "Hola");

      expect(mockSetSpy).toHaveBeenCalledWith(
        "wa:session:5491100000001",
        expect.any(String),
        "EX",
        SESSION_TTL,
      );
    });

    it("silently returns when Redis is unavailable", async () => {
      mockState.available = false;
      await updateSession("5491100000001", "user", "Hola");

      // Should not attempt Redis call
      expect(mockSetSpy).not.toHaveBeenCalled();
      expect(mockGetSpy).not.toHaveBeenCalled();
    });

    it("silently returns on Redis error", async () => {
      mockSetSpy.mockRejectedValueOnce(new Error("Connection refused"));

      // Should not throw
      await expect(
        updateSession("5491100000001", "user", "Hola"),
      ).resolves.toBeUndefined();
    });
  });

  // ── deleteSession ───────────────────────────────────────────────────────

  describe("deleteSession", () => {
    it("deletes an existing session", async () => {
      mockStore.set(
        "wa:session:5491100000001",
        JSON.stringify({ messages: [], updatedAt: 0 }),
      );

      await deleteSession("5491100000001");
      expect(mockStore.has("wa:session:5491100000001")).toBe(false);
    });

    it("silently returns when Redis is unavailable", async () => {
      mockState.available = false;
      await deleteSession("5491100000001");
      expect(mockDelSpy).not.toHaveBeenCalled();
    });
  });

  // ── Constants ───────────────────────────────────────────────────────────

  describe("constants", () => {
    it("SESSION_TTL is 6 hours (21600 seconds)", () => {
      expect(SESSION_TTL).toBe(21_600);
    });

    it("MAX_SESSION_MESSAGES is 20", () => {
      expect(MAX_SESSION_MESSAGES).toBe(20);
    });
  });
});
