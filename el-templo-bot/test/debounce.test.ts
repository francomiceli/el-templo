/**
 * Unit tests for debounce helpers (quick-16 fix 2).
 *
 * Mocks Redis with a Map-backed store and exercises the three helpers in
 * isolation. A full handler-level debounce integration test is intentionally
 * skipped — it would require mocking AI calls and real timers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = new Map<string, string>();
const mockState = { available: true };

const mockGetSpy = vi.fn(async (key: string) => mockStore.get(key) ?? null);
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

vi.mock("../src/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockGetSpy(...(args as [string])),
    set: (...args: unknown[]) =>
      mockSetSpy(...(args as [string, string, string, number])),
    del: (...args: unknown[]) => mockDelSpy(...(args as [string])),
  },
  isRedisAvailable: () => mockState.available,
}));

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
  isDebounceActive,
  setDebounce,
  deleteDebounce,
} from "../src/memory/session";

describe("Debounce helpers (quick-16 fix 2)", () => {
  beforeEach(() => {
    mockStore.clear();
    mockState.available = true;
    vi.clearAllMocks();
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

  it("first setDebounce creates the key", async () => {
    await setDebounce("wa:debounce:555", 10);
    expect(mockStore.get("wa:debounce:555")).toBe("1");
    expect(mockSetSpy).toHaveBeenCalledWith("wa:debounce:555", "1", "EX", 10);
  });

  it("isDebounceActive returns false when no key exists", async () => {
    const active = await isDebounceActive("wa:debounce:555");
    expect(active).toBe(false);
  });

  it("isDebounceActive returns true when key is present (second call within TTL)", async () => {
    await setDebounce("wa:debounce:555", 10);
    const active = await isDebounceActive("wa:debounce:555");
    expect(active).toBe(true);
  });

  it("deleteDebounce clears the key", async () => {
    await setDebounce("wa:debounce:555", 10);
    await deleteDebounce("wa:debounce:555");
    expect(mockStore.has("wa:debounce:555")).toBe(false);
    const active = await isDebounceActive("wa:debounce:555");
    expect(active).toBe(false);
  });

  describe("graceful Redis degradation", () => {
    beforeEach(() => {
      mockState.available = false;
    });

    it("isDebounceActive returns false when Redis unavailable", async () => {
      const active = await isDebounceActive("wa:debounce:555");
      expect(active).toBe(false);
      expect(mockGetSpy).not.toHaveBeenCalled();
    });

    it("setDebounce is a no-op when Redis unavailable", async () => {
      await setDebounce("wa:debounce:555", 10);
      expect(mockSetSpy).not.toHaveBeenCalled();
    });

    it("deleteDebounce is a no-op when Redis unavailable", async () => {
      await deleteDebounce("wa:debounce:555");
      expect(mockDelSpy).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("isDebounceActive returns false on Redis error", async () => {
      mockGetSpy.mockRejectedValueOnce(new Error("Connection refused"));
      const active = await isDebounceActive("wa:debounce:555");
      expect(active).toBe(false);
    });

    it("setDebounce swallows Redis errors", async () => {
      mockSetSpy.mockRejectedValueOnce(new Error("Connection refused"));
      await expect(setDebounce("wa:debounce:555", 10)).resolves.toBeUndefined();
    });

    it("deleteDebounce swallows Redis errors", async () => {
      mockDelSpy.mockRejectedValueOnce(new Error("Connection refused"));
      await expect(deleteDebounce("wa:debounce:555")).resolves.toBeUndefined();
    });
  });
});
