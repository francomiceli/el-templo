/**
 * Unit tests for customer profile memory (Redis-backed).
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

// ─── Mock Redis module ──────────────────────────────────────────────────────

vi.mock("../src/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockGetSpy(...(args as [string])),
    set: (...args: unknown[]) =>
      mockSetSpy(...(args as [string, string, string, number])),
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
  getProfile,
  updateProfile,
  buildProfileContext,
  PROFILE_TTL,
  MAX_NOTES_LENGTH,
} from "../src/memory/profile";
import type { CustomerProfile } from "../src/memory/profile";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Customer Profile Memory", () => {
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
  });

  // ── getProfile ──────────────────────────────────────────────────────────

  describe("getProfile", () => {
    it("returns null when Redis is unavailable", async () => {
      mockState.available = false;
      const result = await getProfile("5491100000001");
      expect(result).toBeNull();
      expect(mockGetSpy).not.toHaveBeenCalled();
    });

    it("returns null when no profile exists", async () => {
      const result = await getProfile("5491100000001");
      expect(result).toBeNull();
    });

    it("returns parsed profile from Redis", async () => {
      const profile: CustomerProfile = {
        name: "Maria",
        clientState: "active_member",
        injuries: ["rodilla izquierda"],
        classPreferences: ["yoga", "funcional"],
        notes: "Viene los lunes y miercoles",
        updatedAt: 1000,
      };
      mockStore.set("wa:profile:5491100000001", JSON.stringify(profile));

      const result = await getProfile("5491100000001");
      expect(result).toEqual(profile);
    });

    it("returns null on Redis error (silent degradation)", async () => {
      mockGetSpy.mockRejectedValueOnce(new Error("Connection refused"));
      const result = await getProfile("5491100000001");
      expect(result).toBeNull();
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────

  describe("updateProfile", () => {
    it("stores profile with 90-day TTL", async () => {
      const profile: CustomerProfile = {
        name: "Juan",
        clientState: "lead",
        notes: "",
        updatedAt: 0,
      };

      await updateProfile("5491100000001", profile);

      expect(mockSetSpy).toHaveBeenCalledWith(
        "wa:profile:5491100000001",
        expect.any(String),
        "EX",
        PROFILE_TTL,
      );

      const stored = mockStore.get("wa:profile:5491100000001");
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.name).toBe("Juan");
    });

    it("silently returns on Redis error", async () => {
      mockSetSpy.mockRejectedValueOnce(new Error("Connection refused"));

      const profile: CustomerProfile = {
        clientState: "lead",
        notes: "",
        updatedAt: 0,
      };

      // Should not throw
      await expect(
        updateProfile("5491100000001", profile),
      ).resolves.toBeUndefined();
    });

    it("silently returns when Redis is unavailable", async () => {
      mockState.available = false;

      const profile: CustomerProfile = {
        clientState: "lead",
        notes: "",
        updatedAt: 0,
      };

      await updateProfile("5491100000001", profile);
      expect(mockSetSpy).not.toHaveBeenCalled();
    });

    it("truncates notes exceeding MAX_NOTES_LENGTH from the beginning", async () => {
      const longNotes = "A".repeat(MAX_NOTES_LENGTH + 500);
      const profile: CustomerProfile = {
        clientState: "active_member",
        notes: longNotes,
        updatedAt: 0,
      };

      await updateProfile("5491100000001", profile);

      const stored = mockStore.get("wa:profile:5491100000001");
      const parsed = JSON.parse(stored!) as CustomerProfile;
      expect(parsed.notes.length).toBe(MAX_NOTES_LENGTH);
      // Should keep the end (most recent notes)
      expect(parsed.notes).toBe("A".repeat(MAX_NOTES_LENGTH));
    });
  });

  // ── buildProfileContext ───────────────────────────────────────────────

  describe("buildProfileContext", () => {
    it("builds context string with all fields", () => {
      const profile: CustomerProfile = {
        name: "Maria",
        clientState: "active_member",
        membershipPlan: "Performance",
        branchPreference: "Palermo",
        injuries: ["rodilla izquierda", "hombro derecho"],
        classPreferences: ["yoga", "funcional"],
        notes: "Viene los lunes",
        updatedAt: 1000,
      };

      const context = buildProfileContext(profile);
      expect(context).toContain("Nombre: Maria");
      expect(context).toContain("Lesiones: rodilla izquierda, hombro derecho");
      expect(context).toContain("Preferencias de clases: yoga, funcional");
      expect(context).toContain("Sede preferida: Palermo");
      expect(context).toContain("Plan: Performance");
      expect(context).toContain("Notas: Viene los lunes");
    });

    it("omits empty fields", () => {
      const profile: CustomerProfile = {
        clientState: "lead",
        notes: "",
        updatedAt: 1000,
      };

      const context = buildProfileContext(profile);
      expect(context).toBe("");
    });

    it("includes only non-empty fields", () => {
      const profile: CustomerProfile = {
        name: "Carlos",
        clientState: "trial",
        notes: "Interesado en crossfit",
        updatedAt: 1000,
      };

      const context = buildProfileContext(profile);
      expect(context).toContain("Nombre: Carlos");
      expect(context).toContain("Notas: Interesado en crossfit");
      expect(context).not.toContain("Lesiones");
      expect(context).not.toContain("Sede preferida");
    });
  });

  // ── Constants ─────────────────────────────────────────────────────────

  describe("constants", () => {
    it("PROFILE_TTL is 90 days (7776000 seconds)", () => {
      expect(PROFILE_TTL).toBe(7_776_000);
    });

    it("MAX_NOTES_LENGTH is 2000 characters", () => {
      expect(MAX_NOTES_LENGTH).toBe(2000);
    });
  });
});
