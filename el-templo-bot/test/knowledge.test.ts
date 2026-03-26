/**
 * Knowledge data accuracy tests.
 *
 * Verifies that the business knowledge file, branch address data,
 * and system prompt integration contain correct information matching
 * the source business document.
 */

import { describe, it, expect } from "vitest";
import { getBusinessKnowledge } from "../src/ai/knowledge.js";
import { BRANCH_ADDRESSES, BRANCH_MAPS_LINKS } from "../src/ai/tools.js";
import { getSystemPrompt } from "../src/ai/system-prompt.js";

// ─── 1. Knowledge file data accuracy ─────────────────────────────────────────

describe("Business knowledge data accuracy", () => {
  const knowledge = getBusinessKnowledge();

  describe("Pricing", () => {
    it("contains correct Flex price", () => {
      expect(knowledge).toMatch(/80[.,]000/);
    });

    it("contains correct Foundation price", () => {
      expect(knowledge).toMatch(/250[.,]000/);
    });

    it("contains correct Performance price", () => {
      expect(knowledge).toMatch(/600[.,]000/);
    });

    it("contains Zero prices for all plan types", () => {
      // Flex Zero
      expect(knowledge).toMatch(/65[.,]000/);
      // Flex+ Zero
      expect(knowledge).toMatch(/80[.,]000/);
      // Foundation Zero
      expect(knowledge).toMatch(/220[.,]000/);
      // Foundation+ Zero
      expect(knowledge).toMatch(/315[.,]000/);
      // Performance Zero
      expect(knowledge).toMatch(/560[.,]000/);
    });

    it("contains credit card prices", () => {
      // Performance TC
      expect(knowledge).toMatch(/670[.,]000/);
      // Foundation+ TC
      expect(knowledge).toMatch(/370[.,]000/);
      // Foundation TC
      expect(knowledge).toMatch(/280[.,]000/);
    });
  });

  describe("Branches", () => {
    it("contains all 5 branch names", () => {
      expect(knowledge).toContain("Constitucion");
      expect(knowledge).toContain("Jujuy");
      expect(knowledge).toContain("Alem");
      expect(knowledge).toContain("Moreno");
      expect(knowledge).toContain("Mario Bravo");
    });

    it("contains schedule data for each branch", () => {
      // Each branch should have time slots listed
      expect(knowledge).toContain("7:00");
      expect(knowledge).toContain("20:00");
      expect(knowledge).toContain("L-V:");
    });
  });

  describe("ROM", () => {
    it("mentions ROM (Range of Motion)", () => {
      expect(knowledge).toContain("ROM");
      expect(knowledge).toMatch(/Range of Motion|Rango Organico de Movilidad/);
    });
  });

  describe("Trial class (sesion de prueba)", () => {
    it("mentions Boarding Pass", () => {
      expect(knowledge).toContain("Boarding Pass");
    });

    it("mentions trial class value and bonification", () => {
      expect(knowledge).toMatch(/20[.,]000/);
      expect(knowledge).toContain("bonificada");
    });
  });

  describe("App help", () => {
    it("mentions app download links", () => {
      expect(knowledge).toContain("Android");
      expect(knowledge).toContain("iPhone");
      expect(knowledge).toMatch(/https?:\/\//);
    });

    it("mentions password recovery steps", () => {
      expect(knowledge).toContain("contrasena");
      expect(knowledge).toContain("recuperacion");
    });
  });
});

// ─── 2. Branch address data accuracy ─────────────────────────────────────────

describe("Branch address data accuracy", () => {
  it("BRANCH_ADDRESSES has exactly 5 entries", () => {
    const keys = Object.keys(BRANCH_ADDRESSES);
    expect(keys).toHaveLength(5);
    expect(keys).toEqual(
      expect.arrayContaining([
        "constitucion",
        "jujuy",
        "alem",
        "moreno",
        "mario bravo",
      ]),
    );
  });

  it("all addresses contain Mar del Plata (NOT Tucuman)", () => {
    for (const [key, address] of Object.entries(BRANCH_ADDRESSES)) {
      expect(address, `${key} should be in Mar del Plata`).toContain(
        "Mar del Plata",
      );
      expect(
        address.toLowerCase(),
        `${key} should NOT contain Tucuman`,
      ).not.toContain("tucum");
    }
  });

  it("BRANCH_MAPS_LINKS has exactly 5 entries matching the same keys", () => {
    const addressKeys = Object.keys(BRANCH_ADDRESSES).sort();
    const mapsKeys = Object.keys(BRANCH_MAPS_LINKS).sort();
    expect(mapsKeys).toEqual(addressKeys);
  });

  it("all Maps links contain goo.gl domain (real short links)", () => {
    for (const [key, link] of Object.entries(BRANCH_MAPS_LINKS)) {
      expect(link, `${key} Maps link should use goo.gl`).toContain("goo.gl");
    }
  });
});

// ─── 3. System prompt integration ────────────────────────────────────────────

describe("System prompt integration", () => {
  const prompt = getSystemPrompt();

  it("contains Conocimiento del negocio section", () => {
    expect(prompt).toContain("Conocimiento del negocio");
  });

  it("contains pricing data", () => {
    expect(prompt).toMatch(/80[.,]000/);
    expect(prompt).toMatch(/600[.,]000/);
  });

  it("has reasonable length indicating knowledge was injected", () => {
    expect(prompt.length).toBeGreaterThan(2000);
  });
});
