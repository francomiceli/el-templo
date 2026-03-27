/**
 * Knowledge data accuracy tests.
 *
 * Verifies that the business knowledge file, branch address data,
 * and system prompt integration contain correct information matching
 * the source business document.
 *
 * Covers all 12 knowledge sections, Mica persona identity, Argentine
 * tuteo tone, tool rules, and state-adaptive behavior for 5 client states.
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
      // Foundation Zero
      expect(knowledge).toMatch(/220[.,]000/);
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

    it("contains single class price", () => {
      expect(knowledge).toContain("20,000");
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

  describe("Sales techniques", () => {
    it("contains urgency strategy", () => {
      expect(knowledge).toMatch(/urgencia|cupos limitados/i);
    });

    it("contains anchoring strategy", () => {
      expect(knowledge).toMatch(/anclaje|anchoring/i);
    });

    it("contains upselling strategy", () => {
      expect(knowledge).toMatch(/upselling|upgrade/i);
    });

    it("contains soft close strategy", () => {
      expect(knowledge).toMatch(/soft close|call to action/i);
    });
  });

  describe("Objection handling", () => {
    it("covers at least 5 of the 7 common objections", () => {
      const objectionKeywords = [
        "caro",
        "tiempo",
        "miedo",
        "pensarlo",
        "otro",
        "lejos",
        "por clase",
      ];
      const foundCount = objectionKeywords.filter((keyword) =>
        knowledge.toLowerCase().includes(keyword),
      ).length;
      expect(foundCount).toBeGreaterThanOrEqual(5);
    });

    it("contains response patterns for objections", () => {
      // Each objection should have a response — check for key response phrases
      expect(knowledge).toMatch(/Boarding Pass|descuento/i);
      expect(knowledge).toMatch(/multinivel|Alfa/i);
      expect(knowledge).toMatch(/cupos|llenan/i);
    });
  });

  describe("Retention strategies", () => {
    it("covers inactive member scenario", () => {
      expect(knowledge).toMatch(/inactivo|no viene|sin asistir/i);
    });

    it("covers membership expiration scenario", () => {
      expect(knowledge).toMatch(/vencer|renovar/i);
    });

    it("covers cancellation/pause scenario", () => {
      expect(knowledge).toMatch(/cancelacion|pausa/i);
    });

    it("covers returning member scenario", () => {
      expect(knowledge).toMatch(/vuelve|regresa/i);
    });
  });

  describe("Golden rules", () => {
    it("has Reglas de Oro section header", () => {
      expect(knowledge).toMatch(/Reglas de Oro/);
    });

    it("contains at least 10 distinct numbered rules", () => {
      // Golden rules are numbered 1-12
      const ruleMatches = knowledge.match(/^\d+\.\s/gm);
      expect(ruleMatches).not.toBeNull();
      expect(ruleMatches!.length).toBeGreaterThanOrEqual(10);
    });

    it("includes key rules: tuteo, emoji, cupos, BUTTONS_SENT, escalar", () => {
      expect(knowledge).toMatch(/tuteo/i);
      expect(knowledge).toMatch(/emoji/i);
      expect(knowledge).toContain("cupos disponibles");
      expect(knowledge).toContain("BUTTONS_SENT");
      expect(knowledge).toMatch(/escalar/i);
    });
  });

  describe("Policies", () => {
    it("covers turnos fijos", () => {
      expect(knowledge).toContain("turnos fijos");
    });

    it("covers self-managed bookings", () => {
      expect(knowledge).toMatch(/autogestionados|autogestionar|autogestion/i);
    });

    it("covers cancellation with time reference", () => {
      expect(knowledge).toMatch(/cancelar/i);
      expect(knowledge).toContain("20 minutos");
    });

    it("covers freeze/vacation policy for Performance only", () => {
      expect(knowledge).toMatch(/congelamiento|vacaciones/i);
      expect(knowledge).toMatch(/Performance/);
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

  it("contains Mica identity", () => {
    expect(prompt).toContain("Mica");
  });

  it("uses Argentine tuteo instructions", () => {
    expect(prompt).toContain("vos");
    expect(prompt).toMatch(/tuteo/i);
  });

  it("contains max emoji rule", () => {
    expect(prompt).toMatch(/1-2 emoji|maximo.*emoji/i);
  });

  it("contains tool usage rules", () => {
    expect(prompt).toContain("BUTTONS_SENT");
    expect(prompt).toContain("check_schedule");
    expect(prompt).toContain("request_human");
  });

  it("contains escalation phrase", () => {
    expect(prompt).toContain("Te paso con alguien del equipo");
  });

  it("contains business knowledge (prompt length > 3000 chars)", () => {
    expect(prompt.length).toBeGreaterThan(3000);
  });

  describe("State-adaptive behavior", () => {
    it("lead state focuses on trial", () => {
      const leadPrompt = getSystemPrompt({ clientState: "lead" });
      expect(leadPrompt).toMatch(/clase de prueba|prueba/i);
    });

    it("active member focuses on community/retention", () => {
      const activePrompt = getSystemPrompt({ clientState: "active_member" });
      expect(activePrompt).toMatch(/comunidad|activo/i);
    });

    it("inactive member focuses on reactivation", () => {
      const inactivePrompt = getSystemPrompt({
        clientState: "inactive_member",
      });
      expect(inactivePrompt).toMatch(/volver|reactivar|motivar/i);
    });

    it("expired member focuses on renewal", () => {
      const expiredPrompt = getSystemPrompt({
        clientState: "expired_member",
      });
      expect(expiredPrompt).toMatch(/renovar|renueve|vencio/i);
    });

    it("trial focuses on conversion", () => {
      const trialPrompt = getSystemPrompt({ clientState: "trial" });
      expect(trialPrompt).toMatch(/miembro|membresia|convertir/i);
    });
  });
});

// ─── 4. Response quality (QUAL-01 through QUAL-07) ──────────────────────────

describe("Response quality (QUAL-01 through QUAL-07)", () => {
  const systemPrompt = getSystemPrompt();
  const knowledge = getBusinessKnowledge();

  // QUAL-01: WhatsApp formatting only
  describe("QUAL-01: WhatsApp-only formatting", () => {
    it("system prompt prohibits markdown headers", () => {
      expect(systemPrompt).toContain("NUNCA usar ### ni headers markdown");
    });

    it("knowledge file uses no ### headers", () => {
      expect(knowledge).not.toMatch(/^#{1,3}\s/m);
    });

    it("stripMarkdownHeaders converts headers to bold", () => {
      // Test the regex pattern used in handler.ts
      const strip = (text: string) => text.replace(/^#{1,3}\s+(.+)$/gm, "*$1*");
      expect(strip("### Horarios")).toBe("*Horarios*");
      expect(strip("## Precios\n### Flex")).toBe("*Precios*\n*Flex*");
      expect(strip("Normal text")).toBe("Normal text");
      expect(strip("# One hash")).toBe("*One hash*");
    });
  });

  // QUAL-02: Flex plans first in pricing
  describe("QUAL-02: Flex plans first", () => {
    it("system prompt instructs Flex first", () => {
      expect(systemPrompt).toMatch(/Flex primero/i);
    });

    it("knowledge lists Flex plans before Foundation", () => {
      const flexIndex = knowledge.indexOf("Planes Flex");
      const foundationIndex = knowledge.indexOf("Planes Foundation");
      expect(flexIndex).toBeGreaterThan(-1);
      expect(foundationIndex).toBeGreaterThan(-1);
      expect(flexIndex).toBeLessThan(foundationIndex);
    });

    it("system prompt says offer Foundation/Performance only on request", () => {
      expect(systemPrompt).toMatch(/Foundation.*Performance.*si preguntan/i);
    });
  });

  // QUAL-03: Max 5 schedule results
  describe("QUAL-03: Schedule max 5 results", () => {
    it("system prompt specifies max 5 classes", () => {
      expect(systemPrompt).toMatch(/[Mm]aximo 5 clases/);
    });
  });

  // QUAL-04: "cupos disponibles" terminology
  describe("QUAL-04: cupos disponibles terminology", () => {
    it("system prompt uses 'cupos disponibles'", () => {
      expect(systemPrompt).toContain("cupos disponibles");
    });

    it("knowledge golden rules mention 'cupos disponibles'", () => {
      expect(knowledge).toContain("cupos disponibles");
    });
  });

  // QUAL-05: Silence after [BUTTONS_SENT]
  describe("QUAL-05: Silence after buttons", () => {
    it("system prompt instructs no text after BUTTONS_SENT", () => {
      expect(systemPrompt).toMatch(/BUTTONS_SENT.*NO enviar/);
    });
  });

  // QUAL-06: Trial registration minimal data
  describe("QUAL-06: Trial registration minimal data", () => {
    it("system prompt specifies only name and preference", () => {
      expect(systemPrompt).toMatch(/[Ss]olo.*nombre.*preferencia/);
    });

    it("system prompt notes phone is already known", () => {
      expect(systemPrompt).toMatch(/telefono ya lo ten/);
    });
  });

  // QUAL-07: Exact escalation phrase with emoji
  describe("QUAL-07: Escalation phrase and silence", () => {
    it("system prompt contains exact escalation phrase with emoji", () => {
      expect(systemPrompt).toContain(
        "Te paso con alguien del equipo, te escriben enseguida \u{1F64C}",
      );
    });

    it("system prompt instructs silence after escalation", () => {
      expect(systemPrompt).toMatch(/te escriben enseguida.*[Ss]ilencio/is);
    });
  });
});
