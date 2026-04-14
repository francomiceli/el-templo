/**
 * Per-ClientState knowledge gating assertions for KGATE-02, KGATE-03, KGATE-04.
 *
 * Content literals match what knowledge.ts actually emits (see SECTIONS array
 * in src/ai/knowledge.ts). Tests intentionally exercise getBusinessKnowledge
 * only — SECTIONS is module-private and that's by design (see 86-02 decision).
 */

import { describe, it, expect } from "vitest";
import { getBusinessKnowledge } from "../src/ai/knowledge.js";
import { getSystemPrompt } from "../src/ai/system-prompt.js";
import type { ClientState } from "../src/state/machine.js";

describe("Knowledge gating — per ClientState", () => {
  const full = getBusinessKnowledge();

  describe("lead (KGATE-02)", () => {
    const lead = getBusinessKnowledge("lead");

    it("includes discovery-relevant content", () => {
      expect(lead).toContain("Que es El Templo");
      expect(lead).toContain("Planes Flex"); // base pricing rendered
      expect(lead).toContain("Precios Zero"); // Reglas Zero section heading
      expect(lead).toContain("Horarios por Sede");
      expect(lead).toContain("Clase de Prueba");
      expect(lead).toContain("Tecnicas de Venta");
      expect(lead).toContain("Reglas de Oro");
      expect(lead).toContain("Objeciones de venta");
      // Sales objections list
      expect(lead).toContain("Es caro");
      expect(lead).toContain("No tengo tiempo");
      expect(lead).toContain("Tengo miedo");
      expect(lead).toContain("Quiero pensarlo");
      expect(lead).toContain("Ya entreno en otro lado");
      expect(lead).toContain("Me queda lejos");
      expect(lead).toContain("Puedo pagar por clase");
    });

    it("excludes member-only content", () => {
      expect(lead).not.toContain("Estrategias de Retencion");
      expect(lead).not.toContain("Ayuda con la App");
      expect(lead).not.toContain("Politicas del Centro");
      // Retention objection "No me convencio / tengo dudas" is retention-tagged
      // and must NOT appear for leads.
      expect(lead).not.toContain("No me convencio");
      // Upgrade paths block
      expect(lead).not.toContain("Caminos de mejora de plan");
      // The dedicated "Mejora de plan" section heading
      expect(lead).not.toContain("*Mejora de plan*");
    });

    it("is smaller than the full set", () => {
      expect(lead.length).toBeLessThan(full.length);
    });
  });

  describe("non-lead states (KGATE-03)", () => {
    const nonLead: Exclude<ClientState, "lead">[] = [
      "trial",
      "active_member",
      "inactive_member",
      "expired_member",
    ];

    for (const state of nonLead) {
      it(`${state} receives the full knowledge set (identical to no-arg call)`, () => {
        expect(getBusinessKnowledge(state)).toBe(full);
      });
    }
  });

  describe("backward compat (KGATE-04)", () => {
    it("no-arg call returns full set including retention + app help + upgrade paths", () => {
      expect(full).toContain("Estrategias de Retencion");
      expect(full).toContain("Ayuda con la App");
      expect(full).toContain("Caminos de mejora de plan");
      expect(full).toContain("No me convencio");
    });

    it("explicit undefined is equivalent to no-arg", () => {
      expect(getBusinessKnowledge(undefined)).toBe(full);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 87 regression locks
// ---------------------------------------------------------------------------

describe("BP consolidation (BPASS-01/02/03)", () => {
  const full = getBusinessKnowledge();
  const lead = getBusinessKnowledge("lead");

  // Canonical opener fragment — unique to the single definition in ZERO_RULES.
  const CANONICAL_OPENER = "primer mes en El Templo";
  // Minimum BP name occurrences preserved across knowledge.ts after 87-01
  // consolidation (7 sites: canonical @L157 has 2 mentions, 5 additional
  // reference sites — TRIAL_FLOW x2, SALES_TECHNIQUES x2, OBJECTIONS_SALES x2,
  // with line 243 removed and 371's Mica-dialogue preserving 2 "Boarding Pass"
  // tokens inside the quote). The locked invariant is that references must
  // not be silently stripped; canonicalization consolidates *meaning*, not
  // presence.
  const MIN_BP_OCCURRENCES = 7;

  it("contains exactly one canonical BP definition (BPASS-01)", () => {
    // "primer mes en El Templo" is the unique opening fragment of the
    // canonical BP paragraph in ZERO_RULES. Any additional occurrence would
    // indicate a re-definition/paraphrase has crept in elsewhere.
    const occurrences = full.split(CANONICAL_OPENER).length - 1;
    expect(occurrences).toBe(1);
  });

  it("preserves Boarding Pass references at all non-canonical sites (BPASS-02)", () => {
    // After 87-02 checkpoint remediation, the `(ver *Reglas Zero*)` pointer
    // suffix was dropped at every discovery-tagged site — canonical BP
    // definition in Reglas Zero is the single source of truth, and other
    // sites preserve the BP *name* without re-explanation. Lock the name
    // preservation invariant: at least 7 occurrences remain.
    const bpCount = full.split("Boarding Pass").length - 1;
    expect(bpCount).toBeGreaterThanOrEqual(MIN_BP_OCCURRENCES);
  });

  it("canonical BP reaches leads via Reglas Zero discovery gate (BPASS-03)", () => {
    // Reglas Zero is discovery-tagged, so the canonical BP paragraph must be
    // present in lead rendering. Leads MUST see the BP definition exactly
    // once (not zero, not duplicated).
    const leadCanonicalOccurrences = lead.split(CANONICAL_OPENER).length - 1;
    expect(leadCanonicalOccurrences).toBe(1);
  });

  it("has no BP re-explanation outside the canonical paragraph (BPASS-02)", () => {
    // Every Boarding Pass occurrence outside the canonical ZERO_RULES
    // paragraph must NOT be followed within a short window by the canonical
    // explanation fragments ("primer mes en El Templo" or the verbatim
    // "beneficio unico (una sola vez)" recap). This catches paraphrase
    // regressions where a future edit inlines the BP definition at a
    // reference site.
    // The canonical BP paragraph lives inside the Reglas Zero section.
    // Bound the exclusion zone from the Reglas Zero heading to the next
    // double-newline after the canonical opener fragment — this covers the
    // `*Boarding Pass (primer mes en El Templo):*` title plus its paragraph.
    const canonicalStart = full.indexOf("*Precios Zero (Descuentos)*");
    expect(canonicalStart).toBeGreaterThanOrEqual(0);
    const openerIdx = full.indexOf(CANONICAL_OPENER, canonicalStart);
    expect(openerIdx).toBeGreaterThan(canonicalStart);
    const canonicalEnd = full.indexOf("\n\n", openerIdx);
    expect(canonicalEnd).toBeGreaterThan(openerIdx);

    const bpRegex = /Boarding Pass/g;
    const reexplanationFragments = [
      "primer mes en El Templo",
      "beneficio unico (una sola vez)",
    ];

    let match: RegExpExecArray | null;
    while ((match = bpRegex.exec(full)) !== null) {
      const idx = match.index;
      // Skip matches inside the canonical paragraph — those are the
      // definitive source.
      if (idx >= canonicalStart && idx <= canonicalEnd) continue;
      const window = full.slice(idx, idx + 200);
      for (const frag of reexplanationFragments) {
        expect(
          window.includes(frag),
          `BP re-explanation fragment "${frag}" found near non-canonical BP mention at index ${idx}: ${window.slice(0, 120)}`,
        ).toBe(false);
      }
    }
  });

  it("has no residual pointer-form drift (BPASS-02)", () => {
    // 87-02 remediation (b) removed all `(ver *Reglas Zero*)` pointer
    // suffixes from discovery-tagged sections. Lock that removal: if a
    // future edit partially reintroduces the pattern, this test catches it.
    // We accept either zero pointers (current state) OR a fully consistent
    // set (all BP refs pointed), but flag the inconsistent middle ground.
    const pointerCount =
      full.split("Boarding Pass (ver *Reglas Zero*)").length - 1;
    expect(pointerCount).toBe(0);
  });
});

describe("Method sections (METHOD-01/02/04)", () => {
  const full = getBusinessKnowledge();
  const lead = getBusinessKnowledge("lead");

  const ELEVATOR_HEADER = "*Metodo (elevator)*";
  const DETAIL_HEADER = "*Metodo (detalle)*";
  // Three stable fragments from METHOD_DETAIL that would not survive any
  // paraphrasing pass — drawn from 87-CONTEXT.md pending_content verbatim.
  const VERBATIM_FRAGMENTS = [
    "método internacional",
    "cuatro niveles activos simultáneamente",
    "No todos los días son iguales",
  ];

  it("includes Metodo (elevator) section header in full knowledge", () => {
    expect(full).toContain(ELEVATOR_HEADER);
  });

  it("includes Metodo (detalle) section header in full knowledge", () => {
    expect(full).toContain(DETAIL_HEADER);
  });

  it("elevator reaches leads (METHOD-04)", () => {
    expect(lead).toContain(ELEVATOR_HEADER);
  });

  it("detalle does NOT reach leads (untagged, full-only)", () => {
    expect(lead).not.toContain(DETAIL_HEADER);
  });

  describe("non-lead states receive both method sections", () => {
    const nonLead: Exclude<ClientState, "lead">[] = [
      "trial",
      "active_member",
      "inactive_member",
      "expired_member",
    ];

    it.each(nonLead)("%s includes elevator + detalle", (state) => {
      const rendered = getBusinessKnowledge(state);
      expect(rendered).toContain(ELEVATOR_HEADER);
      expect(rendered).toContain(DETAIL_HEADER);
    });
  });

  it("preserves the verbatim long-form signature fragments (METHOD-01)", () => {
    // If any fragment disappears, the team-authored long-form has been
    // paraphrased — which 87-CONTEXT.md explicitly forbids.
    for (const frag of VERBATIM_FRAGMENTS) {
      expect(full).toContain(frag);
    }
  });
});

describe("Method-internals deflection rule (METHOD-03)", () => {
  const DEFLECTION_PHRASE = "lo sentís cuando llegás";

  it("rendered lead prompt contains the deflection rule", () => {
    const prompt = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
    });
    expect(prompt).toContain(DEFLECTION_PHRASE);
  });

  describe("deflection rule reaches every non-lead state", () => {
    const nonLead: Exclude<ClientState, "lead">[] = [
      "trial",
      "active_member",
      "inactive_member",
      "expired_member",
    ];

    it.each(nonLead)(
      "%s rendered prompt contains the deflection rule",
      (state) => {
        const prompt = getSystemPrompt({
          clientState: state,
          activePlaybook: "PB1",
          currentStage: "E1A",
        });
        expect(prompt).toContain(DEFLECTION_PHRASE);
      },
    );
  });

  it("rendered lead prompt contains the deflection phrase exactly once (no duplication)", () => {
    const prompt = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "E1A",
    });
    const occurrences = prompt.split(DEFLECTION_PHRASE).length - 1;
    expect(occurrences).toBe(1);
  });
});
