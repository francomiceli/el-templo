/**
 * Unit tests de la tabla única de montos de Aura (fase 214, D-18 y D-19).
 *
 * Todo es puro, sin DB. Fijan la escala nueva: una clase = 5 y ninguna fuente
 * "por día" paga más que una clase.
 */

import { describe, it, expect } from "vitest";
import {
  AURA_AMOUNTS,
  AURA_STREAK,
  AURA_TENURE,
  ACTIVITY_AURA_MAX,
  attendanceAuraFor,
  tenureAuraFor,
} from "../../src/modules/aura/amounts";

describe("aura amounts (fase 214, D-18 y D-19)", () => {
  it("asistir acredita 5 y su reversa descuenta 5", () => {
    expect(AURA_AMOUNTS.attendance).toBe(5);
    expect(AURA_AMOUNTS.attendanceReversal).toBe(5);
  });

  it("fuentes sueltas", () => {
    expect(AURA_AMOUNTS.onboarding).toBe(5);
    expect(AURA_AMOUNTS.training).toBe(3);
    expect(AURA_AMOUNTS.goalPlan).toBe(3);
    expect(AURA_AMOUNTS.extraBlock).toBe(2);
    expect(AURA_AMOUNTS.stretch).toBe(1);
    expect(AURA_AMOUNTS.profilePhoto).toBe(5);
  });

  it("regalo de un alumno vale 1 (fase 215, D-10)", () => {
    expect(AURA_AMOUNTS.giftMember).toBe(1);
  });

  it("programas sin bonus cargado", () => {
    expect(AURA_AMOUNTS.programWeekDefault).toBe(8);
    expect(AURA_AMOUNTS.programCompletionDefault).toBe(50);
  });

  it("antigüedad: 3 meses 15, 6 meses 25, desde 1 año 50", () => {
    expect(tenureAuraFor(3)).toBe(15);
    expect(tenureAuraFor(6)).toBe(25);
    expect(tenureAuraFor(12)).toBe(50);
    expect(tenureAuraFor(24)).toBe(50);
    expect(tenureAuraFor(60)).toBe(50);
    expect(AURA_TENURE).toEqual({ 3: 15, 6: 25, yearly: 50 });
  });

  it("rachas 7/14/30/60/100 días", () => {
    expect(AURA_STREAK).toEqual({ 7: 5, 14: 10, 30: 15, 60: 25, 100: 50 });
  });

  it("escala: ninguna fuente por día supera a una asistencia", () => {
    const perDay = [
      AURA_AMOUNTS.training,
      AURA_AMOUNTS.goalPlan,
      AURA_AMOUNTS.extraBlock,
      AURA_AMOUNTS.stretch,
    ];
    for (const amount of perDay) {
      expect(amount).toBeLessThanOrEqual(AURA_AMOUNTS.attendance);
    }
  });

  it("Aura por asistencia de una actividad (0358): la propia o la de su categoría", () => {
    expect(AURA_AMOUNTS.attendanceSpecial).toBe(10);
    // Sin valor propio: regular 5, especial 10.
    expect(attendanceAuraFor(null, false)).toBe(AURA_AMOUNTS.attendance);
    expect(attendanceAuraFor(undefined, false)).toBe(AURA_AMOUNTS.attendance);
    expect(attendanceAuraFor(null, true)).toBe(AURA_AMOUNTS.attendanceSpecial);
    // El valor propio manda sobre la categoría.
    expect(attendanceAuraFor(15, false)).toBe(15);
    expect(attendanceAuraFor(15, true)).toBe(15);
    expect(attendanceAuraFor(3, true)).toBe(3);
    // 0 es un valor propio (la actividad no da Aura), no "sin configurar".
    expect(attendanceAuraFor(0, true)).toBe(0);
    expect(ACTIVITY_AURA_MAX).toBe(50);
  });
});
