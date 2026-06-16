/**
 * v5.3.3 Phase 96.5 — DATE-01 closure (Finding #2 date hallucination fix).
 *
 * FIVE test scenarios per 96.5-CONTEXT.md D-04:
 *   T1: directive present in rendered prompt (regex shape lock).
 *   T2: snapshot fixture byte-equal at frozen 2026-06-10 miércoles.
 *   T3: KGATE-05 worst-case budget — getSystemPrompt(...).length <= 18916.
 *   T4: default fallback verifies Argentine local date via independent
 *       Intl.DateTimeFormat computation.
 *   T5: forensic Lunes 2023-11-06 anchor (Finding #2 empirical replay).
 *
 * Per `el-templo-bot/CLAUDE.md` Standards: no console logging, no `any` types,
 * `catch (err: unknown)` with `instanceof Error` narrowing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SNAP_PATH = resolve(here, "fixtures/pb1-e1a-lead-rendered.snap.txt");

const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

// ────────────────────────────────────────────────────────────────────────────
// T1 — directive present in rendered prompt (D-04 #1)
// ────────────────────────────────────────────────────────────────────────────

describe("DATE-01 — *Convención:* Hoy es directive present in rendered prompt", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("rendered PB1.E1A lead prompt (with frozen kwargs) contains the *Hoy es* directive matching the locked regex", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      todayISO: "2026-06-10",
      todayDayName: "miércoles",
    });
    expect(prompt).toMatch(
      /\*Convención:\* Hoy es \d{4}-\d{2}-\d{2} \(\w+\)\. Nunca ofrezcas fechas anteriores a hoy\./,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T2 — snapshot fixture byte-equal at frozen miércoles 2026-06-10 (D-04 #2)
// ────────────────────────────────────────────────────────────────────────────

describe("DATE-01 — snapshot fixture byte-equal at frozen miércoles 2026-06-10", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("rendered prompt with todayISO='2026-06-10' todayDayName='miércoles' equals pb1-e1a-lead-rendered.snap.txt byte-equal", async () => {
    const mod = await import("../src/ai/system-prompt");
    const rendered = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      todayISO: "2026-06-10",
      todayDayName: "miércoles",
    });
    const onDisk = readFileSync(SNAP_PATH, "utf8");
    expect(onDisk).toBe(rendered);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T3 — KGATE-05 worst-case budget (D-04 #3)
// ────────────────────────────────────────────────────────────────────────────

describe("DATE-01 — KGATE-05 worst-case budget at miércoles", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("getSystemPrompt(...) JS-string length at worst-case miércoles is <= 18916 (KGATE-05 dual-threshold cap)", async () => {
    const mod = await import("../src/ai/system-prompt");
    const rendered = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      todayISO: "2026-06-10",
      todayDayName: "miércoles",
    });
    // BASELINE_CHARS = 23646; cap = Math.floor(23646 * 0.8) = 18916.
    expect(rendered.length).toBeLessThanOrEqual(18916);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T4 — default fallback verifies Argentine local date (D-04 #4)
//      Exact assertion shape LOCKED per D-02a Intl.DateTimeFormat resolution.
// ────────────────────────────────────────────────────────────────────────────

describe("DATE-01 — default fallback resolves Argentine local date via Intl.DateTimeFormat", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("rendered prompt with NO date kwargs contains a directive matching today in America/Argentina/Buenos_Aires", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
    });

    const match = prompt.match(
      /\*Convención:\* Hoy es (\d{4}-\d{2}-\d{2}) \((\w+)\)\. Nunca ofrezcas fechas anteriores a hoy\./,
    );
    expect(match).not.toBeNull();
    if (match === null) {
      // Type narrowing for TypeScript — never reached due to the assertion above.
      return;
    }
    const capturedISO: string = match[1];
    const capturedDayName: string = match[2];

    // Independently compute the expected ISO for America/Argentina/Buenos_Aires.
    const expectedISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    expect(capturedISO).toBe(expectedISO);
    expect(DAY_NAMES).toContain(capturedDayName as (typeof DAY_NAMES)[number]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T5 — forensic Lunes 2023-11-06 anchor (D-04 #5 — Finding #2 empirical replay)
// ────────────────────────────────────────────────────────────────────────────

describe("DATE-01 — forensic Lunes 2023-11-06 anchor (Finding #2 empirical replay)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("renders directive with forensic Lunes 2023-11-06 anchor (Finding #2 empirical replay)", async () => {
    const mod = await import("../src/ai/system-prompt");
    const prompt = mod.getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
      todayISO: "2023-11-06",
      todayDayName: "lunes",
    });
    expect(prompt).toContain(
      "*Convención:* Hoy es 2023-11-06 (lunes). Nunca ofrezcas fechas anteriores a hoy.",
    );
  });
});
