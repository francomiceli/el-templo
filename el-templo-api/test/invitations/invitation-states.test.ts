/**
 * Fase 194-19 Task 1 — derivación PURA de estados de "Mis invitados" y etapa de
 * lead (referrals/invitation-states.ts). Sin DB ni reloj: tabla de casos con
 * `today` explícito (fechas literales válidas acá porque la función no consulta
 * el calendario real).
 */
import { describe, it, expect } from "vitest";
import {
  accessesUsed,
  deriveInviteeState,
  deriveLeadStage,
  type InviteeStateInput,
  type LeadStageInput,
} from "../../src/modules/referrals/invitation-states";

const TODAY = "2031-03-10";

const base = {
  today: TODAY,
  accessExpiresOn: "2031-03-14",
  classesBudget: 3,
  classesRemaining: 3,
};

describe("deriveInviteeState — orden de reglas (RESEARCH §Patrón 7, D-26e)", () => {
  const cases: Array<{
    name: string;
    input: InviteeStateInput;
    expected: ReturnType<typeof deriveInviteeState>;
  }> = [
    {
      name: "compró y cobertura de membresía hoy -> socio_activo",
      input: { ...base, purchased: true, membershipCoveredUntil: TODAY },
      expected: "socio_activo",
    },
    {
      name: "compró y cobertura futura -> socio_activo",
      input: { ...base, purchased: true, membershipCoveredUntil: "2031-04-01" },
      expected: "socio_activo",
    },
    {
      name: "compró y la cobertura terminó ayer -> inactivo",
      input: { ...base, purchased: true, membershipCoveredUntil: "2031-03-09" },
      expected: "inactivo",
    },
    {
      name: "compró y sin cobertura -> inactivo",
      input: { ...base, purchased: true, membershipCoveredUntil: null },
      expected: "inactivo",
    },
    {
      name: "compró: pesa más que accesos vencidos (socio_activo)",
      input: {
        ...base,
        purchased: true,
        membershipCoveredUntil: "2031-04-01",
        accessExpiresOn: "2031-03-01",
        classesRemaining: 0,
      },
      expected: "socio_activo",
    },
    {
      name: "no compró, hoy > vencimiento -> vencido",
      input: {
        ...base,
        purchased: false,
        membershipCoveredUntil: null,
        accessExpiresOn: "2031-03-09",
      },
      expected: "vencido",
    },
    {
      name: "no compró, hoy = último día de accesos -> sigue vigente (invitado)",
      input: {
        ...base,
        purchased: false,
        membershipCoveredUntil: null,
        accessExpiresOn: TODAY,
      },
      expected: "invitado",
    },
    {
      name: "no compró, accesos agotados dentro de la ventana -> vencido (D-26e)",
      input: {
        ...base,
        purchased: false,
        membershipCoveredUntil: null,
        classesRemaining: 0,
      },
      expected: "vencido",
    },
    {
      name: "no compró, vigente, usó 1 -> entrenando",
      input: {
        ...base,
        purchased: false,
        membershipCoveredUntil: null,
        classesRemaining: 2,
      },
      expected: "entrenando",
    },
    {
      name: "no compró, vigente, usó 0 -> invitado",
      input: { ...base, purchased: false, membershipCoveredUntil: null },
      expected: "invitado",
    },
    {
      name: "N no es 3: presupuesto 4 con 3 usados -> entrenando",
      input: {
        ...base,
        purchased: false,
        membershipCoveredUntil: null,
        classesBudget: 4,
        classesRemaining: 1,
      },
      expected: "entrenando",
    },
    {
      name: "vínculo heredado pendiente (sin invitación ni sub de accesos) -> invitado",
      input: {
        today: TODAY,
        purchased: false,
        membershipCoveredUntil: null,
        accessExpiresOn: null,
        classesBudget: null,
        classesRemaining: null,
      },
      expected: "invitado",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(deriveInviteeState(input)).toBe(expected);
  });
});

describe("deriveLeadStage — convertido > vencido > entrenando > invitado", () => {
  const cases: Array<{
    name: string;
    input: LeadStageInput;
    expected: ReturnType<typeof deriveLeadStage>;
  }> = [
    {
      name: "converted pesa más que cualquier otra cosa (aun vencida)",
      input: {
        ...base,
        converted: true,
        accessExpiresOn: "2031-03-01",
        classesRemaining: 0,
      },
      expected: "convertido",
    },
    {
      name: "vencida por fecha -> vencido",
      input: { ...base, converted: false, accessExpiresOn: "2031-03-09" },
      expected: "vencido",
    },
    {
      name: "agotada -> vencido",
      input: { ...base, converted: false, classesRemaining: 0 },
      expected: "vencido",
    },
    {
      name: "vigente con uso -> entrenando",
      input: { ...base, converted: false, classesRemaining: 1 },
      expected: "entrenando",
    },
    {
      name: "vigente sin uso -> invitado",
      input: { ...base, converted: false },
      expected: "invitado",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(deriveLeadStage(input)).toBe(expected);
  });
});

describe("accessesUsed", () => {
  it("budget - remaining, acotado entre 0 y el presupuesto", () => {
    expect(accessesUsed(3, 3)).toBe(0);
    expect(accessesUsed(3, 1)).toBe(2);
    expect(accessesUsed(4, 0)).toBe(4);
    expect(accessesUsed(3, 5)).toBe(0);
    expect(accessesUsed(3, -2)).toBe(3);
  });

  it("null si falta el presupuesto o el saldo", () => {
    expect(accessesUsed(null, 2)).toBeNull();
    expect(accessesUsed(3, null)).toBeNull();
  });
});
