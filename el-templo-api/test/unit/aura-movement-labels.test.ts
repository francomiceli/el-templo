/**
 * Unit tests de los textos por motivo del detalle de Aura (fase 214, D-13).
 *
 * Puros, sin DB. Los textos salen del UI-SPEC ("Borradores para aprobar", punto 6).
 */

import { describe, it, expect } from "vitest";
import { auraMovementLabel } from "../../src/modules/aura/movement-labels";
import type { GiftLabelInput } from "../../src/modules/aura/gift-rules";

describe("auraMovementLabel (fase 214, D-13)", () => {
  it("asistencia y su reversa", () => {
    expect(auraMovementLabel("attendance", "attendance", 123)).toBe(
      "Asistencia a clase",
    );
    expect(
      auraMovementLabel("manual_adjustment", "attendance_reversal", null),
    ).toBe("Asistencia anulada");
  });

  it("completar el perfil", () => {
    expect(auraMovementLabel("onboarding_completion", null, null)).toBe(
      "Completaste tu perfil",
    );
  });

  it("antiguedad: meses, anios y sin referencia", () => {
    expect(auraMovementLabel("tenure_milestone", "tenure_milestone", 12)).toBe(
      "1 año en El Templo",
    );
    expect(auraMovementLabel("tenure_milestone", "tenure_milestone", 6)).toBe(
      "6 meses en El Templo",
    );
    expect(auraMovementLabel("tenure_milestone", "tenure_milestone", 24)).toBe(
      "2 años en El Templo",
    );
    expect(
      auraMovementLabel("tenure_milestone", "tenure_milestone", null),
    ).toBe("Antigüedad en El Templo");
    expect(auraMovementLabel("tenure_milestone", null, null)).toBe(
      "Antigüedad en El Templo",
    );
  });

  it("racha: con y sin referencia", () => {
    expect(auraMovementLabel("streak_bonus", "streak_milestone", 30)).toBe(
      "30 días seguidos entrenando en la app",
    );
    expect(auraMovementLabel("streak_bonus", "streak_milestone", null)).toBe(
      "Días seguidos entrenando en la app",
    );
    expect(auraMovementLabel("streak_bonus", "streak_milestone", 0)).toBe(
      "Días seguidos entrenando en la app",
    );
  });

  it("fuentes de entrenamiento en la app", () => {
    expect(auraMovementLabel("training_completion", null, null)).toBe(
      "Entrenamiento en la app",
    );
    expect(auraMovementLabel("goal_plan_completion", null, null)).toBe(
      "Sesión de tu plan online",
    );
    expect(auraMovementLabel("extra_block", null, null)).toBe("Bloque libre");
    expect(auraMovementLabel("stretch", null, null)).toBe("Estiramiento");
  });

  it("programas y foto de perfil", () => {
    expect(auraMovementLabel("program_week_completion", null, null)).toBe(
      "Semana de programa",
    );
    expect(auraMovementLabel("program_completion", null, null)).toBe(
      "Programa completo",
    );
    expect(auraMovementLabel("profile_photo", null, null)).toBe(
      "Foto de perfil",
    );
  });

  it("ajuste manual con otro motivo y fuente desconocida", () => {
    expect(auraMovementLabel("manual_adjustment", null, null)).toBe(
      "Ajuste de Aura",
    );
    expect(auraMovementLabel("manual_adjustment", "otro", 1)).toBe(
      "Ajuste de Aura",
    );
    expect(auraMovementLabel("referral", null, null)).toBe(
      "Movimiento de Aura",
    );
    expect(auraMovementLabel("algo_nuevo", "x", 9)).toBe("Movimiento de Aura");
  });
});

describe("auraMovementLabel con regalos (fase 215, D-13, D-19, D-22)", () => {
  const deAlumno: GiftLabelInput = {
    giverKind: "alumno",
    giverFirstName: "Sofía",
    giverLastInitial: "M",
    reason: "energia",
  };
  const deProfe: GiftLabelInput = {
    giverKind: "profe",
    giverFirstName: "Fran",
    giverLastInitial: null,
    reason: "tecnica",
  };

  it("regalo de un alumno: nombre, inicial y motivo", () => {
    expect(auraMovementLabel("social", "aura_gift", 7, deAlumno)).toBe(
      "Sofía M. te dio Aura · Buena energía",
    );
  });

  it("regalo del profe: solo el nombre, sin apellido", () => {
    expect(
      auraMovementLabel("social", "aura_gift", 7, {
        ...deProfe,
        giverLastInitial: "G",
      }),
    ).toBe("Tu profe Fran te dio Aura · Buena técnica");
  });

  it("ME-01: quien dio hoy está oculto: solo monto y motivo, sin nombre ni Alguien", () => {
    const label = auraMovementLabel("social", "aura_gift", 7, {
      ...deAlumno,
      giverHidden: true,
      amount: 1,
    });
    expect(label).toBe("Te dieron 1 de Aura por Buena energía");
    expect(label).not.toContain("Sofía");
    expect(label).not.toContain("Alguien");
  });

  it("#38: quien dio sin nombre cargado no se nombra y usa el monto del regalo", () => {
    expect(
      auraMovementLabel("social", "aura_gift", 7, {
        ...deAlumno,
        giverFirstName: null,
        giverLastInitial: null,
        reason: "constancia",
      }),
    ).toBe("Te dieron 1 de Aura por Constancia");
    expect(
      auraMovementLabel("social", "aura_gift", 7, {
        ...deAlumno,
        giverFirstName: "   ",
        amount: 3,
      }),
    ).toBe("Te dieron 3 de Aura por Buena energía");
  });

  it("el profe nunca es anónimo, ni oculto ni sin nombre", () => {
    expect(
      auraMovementLabel("social", "aura_gift", 7, {
        ...deProfe,
        giverHidden: true,
      }),
    ).toBe("Tu profe Fran te dio Aura · Buena técnica");
    expect(
      auraMovementLabel("social", "aura_gift", 7, {
        ...deProfe,
        giverFirstName: null,
      }),
    ).toBe("Tu profe te dio Aura · Buena técnica");
  });

  it("sin datos del regalo cae en el texto genérico de regalo", () => {
    expect(auraMovementLabel("social", "aura_gift", 7)).toBe("Regalo de Aura");
    expect(auraMovementLabel("social", "aura_gift", 7, null)).toBe(
      "Regalo de Aura",
    );
    expect(auraMovementLabel("social", null, null)).toBe("Regalo de Aura");
  });

  it("la anulación se lee igual con o sin datos del regalo", () => {
    expect(auraMovementLabel("social", "aura_gift_void", 7)).toBe(
      "Regalo anulado",
    );
    expect(auraMovementLabel("social", "aura_gift_void", 7, deAlumno)).toBe(
      "Regalo anulado",
    );
  });

  it("la anulación suma la causa si se conoce (#28, #37)", () => {
    expect(
      auraMovementLabel("social", "aura_gift_void", 7, {
        ...deAlumno,
        voidCause: "asistencia",
      }),
    ).toBe("Regalo anulado: la asistencia se corrigió");
    expect(
      auraMovementLabel("social", "aura_gift_void", 7, {
        ...deAlumno,
        voidCause: "staff",
      }),
    ).toBe("Regalo anulado por el staff");
    expect(
      auraMovementLabel("social", "aura_gift_void", 7, {
        ...deAlumno,
        voidCause: null,
      }),
    ).toBe("Regalo anulado");
  });

  it("la causa de la anulación no cambia el texto del regalo recibido", () => {
    expect(
      auraMovementLabel("social", "aura_gift", 7, {
        ...deAlumno,
        voidCause: "staff",
      }),
    ).toBe(auraMovementLabel("social", "aura_gift", 7, deAlumno));
  });

  it("los datos del regalo no cambian el texto de otras fuentes", () => {
    expect(auraMovementLabel("attendance", "attendance", 1, deAlumno)).toBe(
      "Asistencia a clase",
    );
  });
});
