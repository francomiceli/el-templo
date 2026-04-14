/**
 * Conversation flow validation tests for Phase 81.
 *
 * Covers three requirement areas:
 *   TEST-01: All 14 QA questions have assertions verifying knowledge contains correct answer data
 *   TEST-02: Key conversation flows (lead->trial, active->retain, inactive->reactivate,
 *            expired->renew, objections, escalation, trial registration) are validated
 *   TEST-03: Mica tone rules (tuteo, emoji limit, one question, no headers, short messages)
 *
 * All tests are pure unit tests -- no AI API calls. They verify the system prompt
 * and knowledge strings contain the right content.
 */

import { describe, it, expect } from "vitest";
import { getBusinessKnowledge } from "../src/ai/knowledge.js";
import { getSystemPrompt } from "../src/ai/system-prompt.js";

// ─── TEST-01: 14 QA Questions ──────────────────────────────────────────────────

describe("QA questions answered correctly", () => {
  // AVAT-03 lock (phase 85): these 14 questions verify the v5.2 baseline
  // still answers correctly under the v5.3 playbook engine. Tests render
  // getSystemPrompt() with NO playbook context (no activePlaybook, no
  // currentStage, no currentAvatar) so they exercise the base prompt
  // exactly as v5.2 did. If any of Q1..Q14 ever regress, the v5.3 base
  // prompt has drifted from the v5.2 contract — fix at the source, not
  // in the test.
  //
  // Re-verified: phase 85-02
  const knowledge = getBusinessKnowledge();
  const prompt = getSystemPrompt();

  it("Q1: Horario de clases en Constitucion — has correct schedule slots", () => {
    expect(knowledge).toContain("Constitucion");
    // Weekday morning: 3 slots (7, 8, 9) — NOT 4 (no 10:00 for Constitucion)
    expect(knowledge).toContain("7:00");
    expect(knowledge).toContain("8:00");
    expect(knowledge).toContain("9:00");
    expect(knowledge).toContain("17:00");
    expect(knowledge).toContain("18:00");
    expect(knowledge).toContain("19:00");
    expect(knowledge).toContain("20:00");

    // Verify Constitucion specifically has 3 morning slots, not 4
    // Extract the Constitucion line and check it does not have 10:00
    const constLine = knowledge
      .split("\n")
      .find((l) => l.includes("Constitucion"));
    expect(constLine).toBeDefined();
    expect(constLine).not.toContain("10:00");
  });

  it("Q2: Como renuevo mi membresia — has renewal and payment alias info", () => {
    expect(knowledge).toMatch(/renovar|renovacion/i);
    expect(knowledge).toMatch(/eltemplo\.mdp|eltemplomdp/);
  });

  it("Q3: Dias y horarios de atencion — has admin hours", () => {
    expect(knowledge).toMatch(/[Ll]unes a viernes/);
    expect(knowledge).toContain("7 a 21");
  });

  it("Q4: Formas de pago — lists all payment methods", () => {
    expect(knowledge).toMatch(/[Ee]fectivo/);
    expect(knowledge).toMatch(/transferencia/i);
    expect(knowledge).toMatch(/tarjeta de credito/i);
  });

  it("Q5: Descuento aplica solo si pago en efectivo — Zero rules explain Boarding Pass, not tied to payment", () => {
    // Zero pricing is about Boarding Pass (first-timers) and long-term conversion,
    // NOT about payment method
    expect(knowledge).toContain("Boarding Pass");
    expect(knowledge).toMatch(/primer.*vez|primera vez/i);
    expect(knowledge).toMatch(/[Cc]onversion a plan de largo plazo/);
  });

  it("Q6: Puedo ir todas las veces que quiera con pase libre — Flex+ has 'Hasta 6 por semana'", () => {
    expect(knowledge).toContain("Hasta 6 por semana");
    // Explains modality differences
    expect(knowledge).toMatch(/[Tt]urnos fijos/);
    expect(knowledge).toMatch(/[Tt]urnos fijos o libres/);
  });

  it("Q7: Cuanto dura cada clase — 60 minutes", () => {
    expect(knowledge).toMatch(/60 min/);
  });

  it("Q8: Puedo cambiar de plan — has upgrade paths", () => {
    expect(knowledge).toMatch(/[Mm]ejora de plan|[Cc]aminos de mejora/);
    expect(knowledge).toContain("Flex+");
    expect(knowledge).toContain("Foundation");
    expect(knowledge).toContain("Performance");
  });

  it("Q9: Hay costo extra por clases especiales — ROM info and which plans include it", () => {
    expect(knowledge).toContain("ROM");
    // Plans that include ROM
    expect(knowledge).toMatch(/Flex\+.*ROM|ROM.*Flex\+|Disponible en.*Flex\+/s);
    expect(knowledge).toContain("Foundation+");
    expect(knowledge).toContain("Performance");
    // Basic plans get 2 free sessions to try ROM
    expect(knowledge).toContain("2 sesiones de regalo");
  });

  it("Q10: El pago es automatico o manual — payment is manual (efectivo/transferencia)", () => {
    // Knowledge describes manual payment methods
    expect(knowledge).toMatch(/[Ee]fectivo/);
    expect(knowledge).toMatch(/transferencia/i);
    // No mention of automatic recurring billing
    expect(knowledge).not.toMatch(
      /debito automatico|pago automatico|recurring/i,
    );
  });

  it("Q11: Puedo congelar mi membresia — only Performance allows it", () => {
    expect(knowledge).toMatch(/congelamiento/i);
    expect(knowledge).toMatch(
      /[Ss]olo.*Performance.*congelamiento|Performance.*congelamiento.*vacaciones/s,
    );
  });

  it("Q12: Tienen ofertas para nuevos miembros — Boarding Pass and Zero prices", () => {
    expect(knowledge).toContain("Boarding Pass");
    expect(knowledge).toContain("bonificada");
    // Zero prices exist
    expect(knowledge).toMatch(/[Zz]ero/);
  });

  it("Q13: Puedo transferir mi membresia — no transfer policy, prompt has fallback", () => {
    // Knowledge does NOT contain a membership transfer policy
    expect(knowledge).not.toMatch(
      /transferir.*membresia|transferencia de membresia/i,
    );
    // Prompt has fallback for unknown topics
    expect(prompt).toMatch(/[Nn]o estoy segura|escal/);
  });

  it("Q14: Como se si mi membresia esta activa o cuando vence — app help section", () => {
    expect(knowledge).toContain("Ver membresia");
    expect(knowledge).toContain("Mis servicios/membresias");
  });

  it("AVAT-03: Q1-Q14 baseline still passes when engine renders an active playbook section", () => {
    // Render the prompt with PB1.E1A active AND a known avatar — the most
    // "loaded" possible prompt — and assert that the canonical business
    // knowledge tokens from Q1..Q14 are still present. This catches the
    // failure mode where a future edit to system-prompt.ts accidentally
    // suppresses the base knowledge when a playbook is active.
    //
    // Phase 86 note: with knowledge gating, a PB1 lead no longer sees
    // member-only content (payment methods, app help, retention,
    // upgrade paths, policies). Q4 (*efectivo*) and Q14 (*Ver membresia*)
    // live in the Politicas and App sections respectively and are
    // intentionally filtered out for `clientState === 'lead'` (KGATE-02).
    // The lead assertions below cover the discovery-set tokens; the
    // non-lead assertion immediately after verifies the full set still
    // reaches other states.
    const leadPrompt = getSystemPrompt({
      clientState: "lead",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
      currentAvatar: "gym_crossover",
    });
    expect(leadPrompt).toContain("Constitucion"); // Q1
    expect(leadPrompt).toMatch(/renovar|renovacion/i); // Q2
    expect(leadPrompt).toMatch(/[Ll]unes a viernes/); // Q3
    expect(leadPrompt).toContain("Boarding Pass"); // Q5/Q12
    expect(leadPrompt).toContain("Hasta 6 por semana"); // Q6
    expect(leadPrompt).toMatch(/60 min/); // Q7
    expect(leadPrompt).toContain("Performance"); // Q8/Q11
    expect(leadPrompt).toContain("ROM"); // Q9
    expect(leadPrompt).toMatch(/congelamiento/i); // Q11

    // Non-lead states still receive the full knowledge set (KGATE-03):
    // Q4 (*efectivo*) and Q14 (*Ver membresia*) must be present for a
    // trial user even when a PB1 section is active.
    const trialPrompt = getSystemPrompt({
      clientState: "trial",
      activePlaybook: "PB1",
      currentStage: "PB1.E1A",
      currentAvatar: "gym_crossover",
    });
    expect(trialPrompt).toMatch(/[Ee]fectivo/); // Q4
    expect(trialPrompt).toContain("Ver membresia"); // Q14
  });
});

// ─── TEST-02: Conversation Flows ────────────────────────────────────────────────

describe("Conversation flow correctness", () => {
  const knowledge = getBusinessKnowledge();

  it("Lead asking for info is guided toward trial", () => {
    const leadPrompt = getSystemPrompt({ clientState: "lead" });
    expect(leadPrompt).toMatch(/clase de prueba/i);
    expect(leadPrompt).toMatch(/guiarlo/i);
    // Knowledge has trial flow data
    expect(knowledge).toContain("Boarding Pass");
    expect(knowledge).toContain("bonificada");
    expect(knowledge).toContain("24 horas");
  });

  it("Active member gets retention focus", () => {
    const activePrompt = getSystemPrompt({ clientState: "active_member" });
    expect(activePrompt).toMatch(/comunidad|familiaridad/i);
    expect(activePrompt).toMatch(/upgrades|beneficios/i);
  });

  it("Inactive member gets warm reactivation", () => {
    const inactivePrompt = getSystemPrompt({ clientState: "inactive_member" });
    expect(inactivePrompt).toMatch(/reactivarla|volver/i);
    expect(inactivePrompt).toMatch(/calidez/i);
    expect(inactivePrompt).toMatch(/no presion/i);
    // Knowledge has inactive member strategies
    expect(knowledge).toMatch(/inactivo|sin asistir/i);
  });

  it("Expired member gets renewal guidance", () => {
    const expiredPrompt = getSystemPrompt({ clientState: "expired_member" });
    expect(expiredPrompt).toMatch(/renueve|renovar/i);
    expect(expiredPrompt).toMatch(/planes actuales|opciones/i);
  });

  it("Objection handling covers all 8 objections", () => {
    const objectionKeywords = [
      "caro",
      "tiempo",
      "miedo",
      "pensarlo",
      "otro lado",
      "lejos",
      "por clase",
      "convencio",
    ];
    const missing = objectionKeywords.filter(
      (keyword) => !knowledge.toLowerCase().includes(keyword),
    );
    expect(
      missing,
      `Missing objection keywords: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it("Escalation rule references tool + silence", () => {
    // P1-4 (quick 14): the handoff phrase is now owned by the
    // `request_human` tool itself, not the base prompt. The prompt only
    // tells Mica to invoke the tool and go silent afterwards.
    const prompt = getSystemPrompt();
    expect(prompt).toContain("request_human");
    expect(prompt).toMatch(/SILENCIO/);
  });

  it("Trial registration asks minimal data", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toMatch(/nombre/i);
    expect(prompt).toMatch(/preferencia/i);
    expect(prompt).toMatch(/telefono ya lo ten/i);
  });
});

// ─── TEST-03: Tone Verification ─────────────────────────────────────────────────

describe("Mica tone rules", () => {
  const prompt = getSystemPrompt();
  const knowledge = getBusinessKnowledge();

  it("System prompt contains Argentine tuteo instructions", () => {
    expect(prompt).toMatch(/tuteo argentino/i);
    expect(prompt).toContain("vos");
    expect(prompt).toContain("querés");
    expect(prompt).toContain("podés");
    expect(prompt).toContain("tenés");
  });

  it("System prompt limits emojis to 1-2 per message", () => {
    expect(prompt).toMatch(/[Mm]aximo 1-2 emoji/);
  });

  it("System prompt requires one question at a time", () => {
    expect(prompt).toContain("Una pregunta a la vez");
  });

  it("Knowledge output contains no ### headers", () => {
    expect(knowledge).not.toMatch(/^#{1,3}\s/m);
  });

  it("System prompt prefers short messages", () => {
    expect(prompt).toContain("cortos");
    expect(prompt).toContain("escaneables");
  });

  it("Golden rules reinforce tone", () => {
    // Tuteo rule
    expect(knowledge).toMatch(/tuteo argentino/i);
    // Emoji limit rule
    expect(knowledge).toMatch(/1-2 emoji/);
    // One question at a time
    expect(knowledge).toContain("Una pregunta a la vez");
    // Close with question or call to action
    expect(knowledge).toMatch(/cerrar con una pregunta|call to action/i);
  });
});
