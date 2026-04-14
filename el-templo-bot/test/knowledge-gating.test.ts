/**
 * Per-ClientState knowledge gating assertions for KGATE-02, KGATE-03, KGATE-04.
 *
 * Content literals match what knowledge.ts actually emits (see SECTIONS array
 * in src/ai/knowledge.ts). Tests intentionally exercise getBusinessKnowledge
 * only — SECTIONS is module-private and that's by design (see 86-02 decision).
 */

import { describe, it, expect } from "vitest";
import { getBusinessKnowledge } from "../src/ai/knowledge.js";
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
