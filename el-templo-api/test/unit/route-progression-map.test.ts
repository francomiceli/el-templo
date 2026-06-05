/**
 * Unit tests for the per-route progression classifier (route-progression-map.ts).
 * Pure logic, no DB. The ROUTE_PROGRESSION_MAP IS the spec, so the suite walks
 * EVERY declared token and asserts it lands in its bucket, plus typo/normalization
 * cases, unknown tokens, linear routes, and excluded routes.
 *
 * Run (CI / pure-unit): pnpm vitest run --config vitest.config.unit.ts
 */

import { describe, it, expect } from "vitest";
import {
  ROUTE_PROGRESSION_MAP,
  classify,
  normalizeWords,
  normalizeRoute,
  excludedRoutes,
  type RouteDefinition,
} from "../../src/modules/exercises/route-progression-map";

const entries = Object.entries(ROUTE_PROGRESSION_MAP) as [
  string,
  RouteDefinition,
][];
const tokenRoutes = entries.filter(([, d]) => d.strategy === "token");
const linearRoutes = entries.filter(([, d]) => d.strategy === "linear");
const excluded = entries.filter(([, d]) => d.strategy === "excluded");

/** Normalize a declared token the same way classify() does, for comparison. */
function norm(token: string): string {
  return normalizeWords(token).join(" ");
}

describe("ROUTE_PROGRESSION_MAP — structural invariants", () => {
  it("every route has a valid strategy", () => {
    for (const [route, def] of entries) {
      expect(["token", "linear", "excluded"]).toContain(def.strategy);
      expect(route).toBe(route.trim().toUpperCase());
    }
  });

  it("token routes have ≥1 step; linear/excluded have no steps", () => {
    for (const [, def] of tokenRoutes)
      expect((def.steps ?? []).length).toBeGreaterThan(0);
    for (const [, def] of linearRoutes) expect(def.steps ?? []).toHaveLength(0);
    for (const [, def] of excluded) {
      expect(def.steps ?? []).toHaveLength(0);
      expect(def.habilidades ?? []).toHaveLength(0);
    }
  });

  it("steps and habilidades never overlap within a route (normalized)", () => {
    for (const [route, def] of entries) {
      const steps = new Set((def.steps ?? []).map(norm));
      for (const h of def.habilidades ?? []) {
        expect(
          steps.has(norm(h)),
          `${route}: "${h}" is both step and habilidad`,
        ).toBe(false);
      }
    }
  });
});

describe("classify — every declared STEP token lands at its index", () => {
  for (const [route, def] of tokenRoutes) {
    const steps = def.steps ?? [];
    steps.forEach((token, index) => {
      it(`${route}: "${token}" → step ${index}`, () => {
        const r = classify(token, route);
        expect(r.kind).toBe("step");
        expect(r.step).toBe(index);
      });
    });
  }
});

describe("classify — every declared HABILIDAD token is detected", () => {
  for (const [route, def] of tokenRoutes) {
    for (const token of def.habilidades ?? []) {
      it(`${route}: "${token}" → habilidad`, () => {
        const r = classify(token, route);
        // A bare habilidad token has no step → unknown, but habilidad is set.
        expect(r.habilidad).toBe(norm(token));
      });
    }
  }
});

describe("classify — step + habilidad combined", () => {
  it("BL STRADDLE SUPINE → step=Straddle, habilidad=SUPINE", () => {
    const r = classify("BL STRADDLE SUPINE", "BL");
    const straddleIdx = (ROUTE_PROGRESSION_MAP.BL.steps ?? []).indexOf(
      "STRADDLE",
    );
    expect(r.kind).toBe("step");
    expect(r.step).toBe(straddleIdx);
    expect(r.habilidad).toBe("SUPINE");
  });

  it("BL prone (default grip) carries no habilidad", () => {
    const r = classify("BL ADV TUCK PRONE", "BL");
    expect(r.kind).toBe("step");
    expect(r.step).toBe(
      (ROUTE_PROGRESSION_MAP.BL.steps ?? []).indexOf("ADV TUCK"),
    );
    expect(r.habilidad).toBeNull();
  });

  it("MU rings (implement) is habilidad, not a step", () => {
    const r = classify("RINGS", "MU");
    expect(r.habilidad).toBe("RINGS");
  });
});

describe("classify — specificity (longest token wins)", () => {
  it('"ADV TUCK" beats "TUCK"', () => {
    const idxAdv = (ROUTE_PROGRESSION_MAP.FL.steps ?? []).indexOf("ADV TUCK");
    expect(classify("ADV TUCK", "FL").step).toBe(idxAdv);
  });
  it('"SUPER ADV TUCK" → SUPER ADV (not ADV TUCK or TUCK)', () => {
    const idxSuper = (ROUTE_PROGRESSION_MAP.FL.steps ?? []).indexOf(
      "SUPER ADV",
    );
    expect(classify("SUPER ADV TUCK", "FL").step).toBe(idxSuper);
  });
  it('bare "TUCK" → TUCK', () => {
    expect(classify("TUCK", "FL").step).toBe(0);
  });
});

describe("normalizeWords — typos and abbreviations", () => {
  it.each([
    ["TYPWRITER", "TYPEWRITER"],
    ["ASISSTED", "ASSISTED"],
    ["ASSIST", "ASSISTED"],
    ["STR", "STRADDLE"],
    ["HOR", "HORIZONTAL"],
    ["HORZONTAL", "HORIZONTAL"],
    ["SUPER ADVANCED", "SUPER ADV"],
    ["O.L", "OL"],
    ["P-BARS", "P BARS"],
  ])('"%s" → "%s"', (raw, expected) => {
    expect(normalizeWords(raw).join(" ")).toBe(expected);
  });

  it("typo TYPWRITER classifies as the TYPEWRITER step in OAPU", () => {
    const idx = (ROUTE_PROGRESSION_MAP.OAPU.steps ?? []).indexOf("TYPEWRITER");
    expect(classify("TYPWRITER", "OAPU").step).toBe(idx);
  });
  it('abbrev "STR" classifies as the STRADDLE step in FL', () => {
    const idx = (ROUTE_PROGRESSION_MAP.FL.steps ?? []).indexOf("STRADDLE");
    expect(classify("STR", "FL").step).toBe(idx);
  });
});

describe("classify — unknown tokens", () => {
  it("a token route with no matching token → unknown, step null", () => {
    const r = classify("ZZZ NONSENSE", "FL");
    expect(r.kind).toBe("unknown");
    expect(r.step).toBeNull();
  });
  it("an unmapped route → unknown", () => {
    expect(classify("anything", "ZZZ").kind).toBe("unknown");
  });
});

describe("classify — linear routes (legs)", () => {
  for (const [route] of linearRoutes) {
    it(`${route}: base exercise → linear, step null`, () => {
      const r = classify("SOME BASE MOVEMENT", route);
      expect(r.kind).toBe("linear");
      expect(r.step).toBeNull();
    });
  }

  it("PS weighted → habilidad W", () => {
    expect(classify("PS W", "PS").habilidad).toBe("W");
  });
  it("SU one-leg (O.L) → habilidad OL", () => {
    expect(classify("STEP UP O.L", "SU").habilidad).toBe("OL");
  });
  it("PS jump → habilidad JUMP", () => {
    expect(classify("SQUAT TUCK JUMP", "PS").habilidad).toBe("JUMP");
  });
  it('"SNOWBOARD SQUATS" does not falsely match W', () => {
    expect(classify("SNOWBOARD SQUATS", "PS").habilidad).toBeNull();
  });
});

describe("classify — excluded routes", () => {
  for (const [route] of excluded) {
    it(`${route} → excluded`, () => {
      expect(classify("whatever", route).kind).toBe("excluded");
    });
  }
  it("empty/blank route (games) → excluded", () => {
    expect(classify("WALL SKIPPING", "").kind).toBe("excluded");
    expect(classify("x", "   ").kind).toBe("excluded");
  });
  it("excludedRoutes() lists exactly the excluded set", () => {
    expect(new Set(excludedRoutes())).toEqual(
      new Set(excluded.map(([r]) => r)),
    );
  });
});

describe("normalizeRoute", () => {
  it("upper-cases and trims", () => {
    expect(normalizeRoute("  hd/id ")).toBe("HD/ID");
  });
});
