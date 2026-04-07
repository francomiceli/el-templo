/**
 * Unit tests for the pure profile-tag parser.
 *
 * `extractProfileTag` and `stripProfileTag` are side-effect-free helpers
 * with no Redis, no logger, and no webhook imports. These tests cover
 * the full parser contract: valid detection, invalid value rejection,
 * missing/malformed tags, case-insensitive tag names, whitespace tolerance,
 * AvatarProfile parity, determinism, and input immutability.
 */

import { describe, it, expect } from "vitest";
import {
  extractProfileTag,
  stripProfileTag,
} from "../src/playbooks/profile-tag";
import type { AvatarProfile } from "../src/playbooks/types";

describe("extractProfileTag", () => {
  // ── Valid detection (one per avatar) ─────────────────────────────────────

  describe("valid detection", () => {
    it("detects cero_absoluto", () => {
      expect(
        extractProfileTag(
          "Dale, te espero el viernes 💪 <profile>cero_absoluto</profile>",
        ),
      ).toBe("cero_absoluto");
    });

    it("detects gym_crossover", () => {
      expect(
        extractProfileTag(
          "Copado que venís de crossfit. <profile>gym_crossover</profile>",
        ),
      ).toBe("gym_crossover");
    });

    it("detects intermedio (tag-only message)", () => {
      expect(extractProfileTag("<profile>intermedio</profile>")).toBe(
        "intermedio",
      );
    });

    it("detects retorna", () => {
      expect(
        extractProfileTag("Bienvenido de vuelta <profile>retorna</profile>"),
      ).toBe("retorna");
    });
  });

  // ── Invalid value rejection ──────────────────────────────────────────────

  describe("invalid value rejection", () => {
    it("returns null for an unknown enum value", () => {
      expect(extractProfileTag("<profile>expert</profile>")).toBeNull();
    });

    it("accepts uppercase values via case folding", () => {
      // Documents the case-insensitive behavior — uppercase values are
      // lowercased before validation, so they map back to the enum.
      expect(extractProfileTag("<profile>CERO_ABSOLUTO</profile>")).toBe(
        "cero_absoluto",
      );
    });

    it("rejects deprecated 'principiante' (not in the 4-avatar set)", () => {
      expect(extractProfileTag("<profile>principiante</profile>")).toBeNull();
    });
  });

  // ── Missing tag ──────────────────────────────────────────────────────────

  describe("missing tag", () => {
    it("returns null when no tag is present", () => {
      expect(
        extractProfileTag("Hola, ¿ya entrenaste calistenia antes?"),
      ).toBeNull();
    });

    it("returns null on empty string", () => {
      expect(extractProfileTag("")).toBeNull();
    });
  });

  // ── Malformed tag ────────────────────────────────────────────────────────

  describe("malformed tag", () => {
    it("returns null on unclosed tag", () => {
      expect(extractProfileTag("<profile>intermedio")).toBeNull();
    });

    it("returns null on empty tag body", () => {
      expect(extractProfileTag("<profile></profile>")).toBeNull();
    });

    it("rejects tags with spaces inside the delimiter", () => {
      // The parser is strict on the tag delimiters: only exact `<profile>`
      // and `</profile>` are accepted. `< profile >` is not a tag.
      expect(extractProfileTag("< profile >intermedio</profile>")).toBeNull();
    });
  });

  // ── Case-insensitive tag name ────────────────────────────────────────────

  it("matches a capitalised tag name", () => {
    expect(extractProfileTag("<Profile>intermedio</Profile>")).toBe(
      "intermedio",
    );
  });

  // ── Whitespace tolerance inside the tag ──────────────────────────────────

  it("trims leading/trailing whitespace inside the tag body", () => {
    expect(extractProfileTag("<profile>  intermedio  </profile>")).toBe(
      "intermedio",
    );
  });

  // ── AvatarProfile parity ─────────────────────────────────────────────────

  it("round-trips every AvatarProfile value", () => {
    const all: AvatarProfile[] = [
      "cero_absoluto",
      "gym_crossover",
      "intermedio",
      "retorna",
    ];
    for (const v of all) {
      expect(extractProfileTag(`<profile>${v}</profile>`)).toBe(v);
    }
  });

  // ── Purity: determinism ──────────────────────────────────────────────────

  it("is deterministic across repeated calls", () => {
    const input = "<profile>intermedio</profile>";
    for (let i = 0; i < 100; i++) {
      expect(extractProfileTag(input)).toBe("intermedio");
    }
  });
});

describe("stripProfileTag", () => {
  it("strips a trailing tag on the same line", () => {
    expect(stripProfileTag("ok 💪 <profile>intermedio</profile>")).toBe(
      "ok 💪",
    );
  });

  it("strips a tag on its own line", () => {
    expect(stripProfileTag("ok 💪\n<profile>intermedio</profile>")).toBe(
      "ok 💪",
    );
  });

  it("strips multiple tags defensively", () => {
    const result = stripProfileTag(
      "a <profile>intermedio</profile> b <profile>retorna</profile> c",
    );
    // The parser does not collapse internal whitespace beyond removing the
    // tag — we only assert the tags are gone and surrounding text is intact.
    expect(result).not.toMatch(/<profile>/);
    expect(result.trim()).toContain("a");
    expect(result.trim()).toContain("b");
    expect(result.trim()).toContain("c");
  });

  it("leaves text untouched when no tag is present", () => {
    expect(stripProfileTag("Hola, ¿cómo andás?")).toBe("Hola, ¿cómo andás?");
  });

  it("preserves emoji and multi-line structure", () => {
    expect(
      stripProfileTag(
        "Hola 💪\n\n¿Ya entrenaste?\n<profile>cero_absoluto</profile>",
      ),
    ).toBe("Hola 💪\n\n¿Ya entrenaste?");
  });

  // ── Purity: input immutability ───────────────────────────────────────────

  it("does not mutate the input string", () => {
    const original = "ok 💪 <profile>intermedio</profile>";
    stripProfileTag(original);
    expect(original).toBe("ok 💪 <profile>intermedio</profile>");
  });
});
