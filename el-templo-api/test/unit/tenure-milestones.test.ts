/**
 * Unit tests for the tenure-milestones module (aniversarios de permanencia).
 *
 * Todas las funciones son puras -- sin DB ni server context. Cubren los bordes:
 * recorte de fin de mes, día exacto vs no-aniversario, ventana entre asistencias
 * (una vez, arrastre a la próxima clase), y la secuencia anual post-1-año.
 */

import { describe, it, expect } from "vitest";
import {
  isMilestone,
  milestoneAura,
  formatMilestoneLabel,
  toUtcDateStr,
  addMonthsClamped,
  monthsElapsedExact,
  milestoneOnDate,
  milestoneInWindow,
} from "../../src/modules/shared/tenure-milestones";

describe("tenure-milestones", () => {
  // ─── isMilestone ────────────────────────────────────────────────────────────

  describe("isMilestone", () => {
    it("acepta 3 y 6 meses", () => {
      expect(isMilestone(3)).toBe(true);
      expect(isMilestone(6)).toBe(true);
    });

    it("acepta múltiplos de 12 desde 12 (1, 2, 3... años)", () => {
      expect(isMilestone(12)).toBe(true);
      expect(isMilestone(24)).toBe(true);
      expect(isMilestone(120)).toBe(true);
    });

    it("rechaza meses intermedios (no hay 'y medio' post-año)", () => {
      expect(isMilestone(1)).toBe(false);
      expect(isMilestone(9)).toBe(false);
      expect(isMilestone(18)).toBe(false);
      expect(isMilestone(30)).toBe(false);
    });

    it("rechaza no-enteros y no-positivos", () => {
      expect(isMilestone(0)).toBe(false);
      expect(isMilestone(-12)).toBe(false);
      expect(isMilestone(3.5)).toBe(false);
    });
  });

  // ─── milestoneAura ──────────────────────────────────────────────────────────

  describe("milestoneAura", () => {
    it("sigue la escalera 50 / 100 / 250 / +250", () => {
      expect(milestoneAura(3)).toBe(50);
      expect(milestoneAura(6)).toBe(100);
      expect(milestoneAura(12)).toBe(250);
      expect(milestoneAura(24)).toBe(250);
      expect(milestoneAura(60)).toBe(250);
    });
  });

  // ─── formatMilestoneLabel ───────────────────────────────────────────────────

  describe("formatMilestoneLabel", () => {
    it("meses en singular gramatical del negocio", () => {
      expect(formatMilestoneLabel(3)).toBe("3 meses");
      expect(formatMilestoneLabel(6)).toBe("6 meses");
    });

    it("1 año en singular, resto en plural", () => {
      expect(formatMilestoneLabel(12)).toBe("1 año");
      expect(formatMilestoneLabel(24)).toBe("2 años");
      expect(formatMilestoneLabel(36)).toBe("3 años");
    });
  });

  // ─── toUtcDateStr ───────────────────────────────────────────────────────────

  describe("toUtcDateStr", () => {
    it("normaliza Date, ISO string y fecha plana", () => {
      expect(toUtcDateStr(new Date("2025-01-15T10:00:00Z"))).toBe("2025-01-15");
      expect(toUtcDateStr("2025-01-15T23:30:00Z")).toBe("2025-01-15");
      expect(toUtcDateStr("2025-01-15")).toBe("2025-01-15");
    });

    it("devuelve null defensivamente para nulo/ inválido", () => {
      expect(toUtcDateStr(null)).toBeNull();
      expect(toUtcDateStr(undefined)).toBeNull();
      expect(toUtcDateStr("no-es-fecha")).toBeNull();
    });
  });

  // ─── addMonthsClamped ───────────────────────────────────────────────────────

  describe("addMonthsClamped", () => {
    it("suma meses en un caso regular", () => {
      expect(addMonthsClamped("2025-01-15", 3)).toBe("2025-04-15");
      expect(addMonthsClamped("2025-01-15", 12)).toBe("2026-01-15");
    });

    it("recorta el día al fin de mes destino (31-ene -> feb)", () => {
      expect(addMonthsClamped("2025-01-31", 1)).toBe("2025-02-28");
      expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29"); // bisiesto
    });

    it("recorta a meses de 30 días (31-ago -> 30-sep)", () => {
      expect(addMonthsClamped("2025-08-31", 1)).toBe("2025-09-30");
    });

    it("cruza el año correctamente", () => {
      expect(addMonthsClamped("2024-12-15", 3)).toBe("2025-03-15");
    });
  });

  // ─── monthsElapsedExact ─────────────────────────────────────────────────────

  describe("monthsElapsedExact", () => {
    it("devuelve N en un aniversario exacto", () => {
      expect(monthsElapsedExact("2025-01-15", "2025-04-15")).toBe(3);
      expect(monthsElapsedExact("2025-01-15", "2026-01-15")).toBe(12);
    });

    it("null cuando no es aniversario exacto", () => {
      expect(monthsElapsedExact("2025-01-15", "2025-04-20")).toBeNull();
      expect(monthsElapsedExact("2025-01-15", "2025-04-10")).toBeNull();
    });

    it("reconoce el aniversario recortado de un alta a fin de mes", () => {
      expect(monthsElapsedExact("2025-01-31", "2025-02-28")).toBe(1);
      expect(monthsElapsedExact("2025-01-31", "2025-03-31")).toBe(2);
    });

    it("null para fecha igual o anterior al alta", () => {
      expect(monthsElapsedExact("2025-01-15", "2025-01-15")).toBeNull();
      expect(monthsElapsedExact("2025-01-15", "2024-12-15")).toBeNull();
    });
  });

  // ─── milestoneOnDate ────────────────────────────────────────────────────────

  describe("milestoneOnDate", () => {
    it("detecta el hito de 3 meses el día exacto", () => {
      const m = milestoneOnDate("2025-01-10T12:00:00Z", "2025-04-10");
      expect(m).toEqual({ months: 3, label: "3 meses", aura: 50 });
    });

    it("detecta 1 año con label y aura correctos", () => {
      const m = milestoneOnDate("2024-08-06T00:00:00Z", "2025-08-06");
      expect(m).toEqual({ months: 12, label: "1 año", aura: 250 });
    });

    it("detecta 2 años", () => {
      const m = milestoneOnDate("2023-08-06T00:00:00Z", "2025-08-06");
      expect(m).toEqual({ months: 24, label: "2 años", aura: 250 });
    });

    it("null en un mes que no es hito (ej. 9 meses)", () => {
      expect(milestoneOnDate("2025-01-10", "2025-10-10")).toBeNull();
    });

    it("null un día antes o después del aniversario", () => {
      expect(milestoneOnDate("2025-01-10", "2025-04-09")).toBeNull();
      expect(milestoneOnDate("2025-01-10", "2025-04-11")).toBeNull();
    });

    it("null para createdAt ausente (defensivo)", () => {
      expect(milestoneOnDate(null, "2025-04-10")).toBeNull();
    });

    it("hito de fin de mes: alta 30-nov cae 28-feb a los 3 meses", () => {
      const m = milestoneOnDate("2024-11-30", "2025-02-28");
      expect(m?.months).toBe(3);
    });
  });

  // ─── milestoneInWindow ──────────────────────────────────────────────────────

  describe("milestoneInWindow", () => {
    const created = "2024-08-06"; // alta

    it("muestra el hito el día exacto si vino ese día", () => {
      // ventana: clase anterior 2025-08-01, clase de hoy = aniversario 2025-08-06
      const m = milestoneInWindow(created, "2025-08-01", "2025-08-06");
      expect(m?.months).toBe(12);
    });

    it("arrastra el hito a la próxima clase si el día exacto cayó en falta", () => {
      // el aniversario (06/08) pasó entre la clase del 04 y la del 09
      const m = milestoneInWindow(created, "2025-08-04", "2025-08-09");
      expect(m?.months).toBe(12);
    });

    it("NO lo repite en la clase siguiente (aparece una sola vez)", () => {
      // ya se mostró en la del 09; ahora la ventana es (09, 12] y el hito quedó fuera
      const m = milestoneInWindow(created, "2025-08-09", "2025-08-12");
      expect(m).toBeNull();
    });

    it("null cuando no cruza ningún hito", () => {
      const m = milestoneInWindow(created, "2025-03-01", "2025-03-15");
      expect(m).toBeNull();
    });

    it("elige el hito MÁS significativo si una ausencia larga cruza varios", () => {
      // ventana absurda que cruza 3 y 6 meses; gana el de 6
      const m = milestoneInWindow(created, "2024-10-01", "2025-03-01");
      expect(m?.months).toBe(6);
    });

    it("incluye el hito de hoy aunque aún no haya check-in (borde superior inclusivo)", () => {
      const m = milestoneInWindow(created, "2024-11-01", "2024-11-06");
      expect(m?.months).toBe(3);
    });

    it("null si la ventana está invertida o vacía (defensivo)", () => {
      expect(milestoneInWindow(created, "2025-08-06", "2025-08-06")).toBeNull();
      expect(milestoneInWindow(created, "2025-08-10", "2025-08-06")).toBeNull();
    });

    it("null cuando el alumno todavía no llegó al primer hito", () => {
      const m = milestoneInWindow("2025-08-01", "2025-08-15", "2025-09-30");
      expect(m).toBeNull();
    });

    it("hito de fin de mes dentro de la ventana", () => {
      // alta 31-ene: 1 año = 31-ene-2026; ventana lo abarca
      const m = milestoneInWindow("2025-01-31", "2026-01-28", "2026-02-02");
      expect(m?.months).toBe(12);
    });
  });
});
