/**
 * Unit tests — motor de cadencia de mensajes en Sesiones de Prueba
 * (`src/modules/reports/trial-cadence.ts`). PURO, sin DB — corre en foreground
 * sin timeout especial (no toca MySQL, a diferencia del resto de la suite).
 *
 * Calendario de referencia (verificado con `date -d <fecha> +%A`):
 *   2026-09-21 lun, 22 mar, 23 mié, 24 jue, 25 vie, 26 sáb, 27 dom, 28 lun.
 */
import { describe, it, expect } from "vitest";
import {
  computeNextAction,
  deriveSessionStatus,
  hasMorningShift,
  hasAfternoonShift,
  resolveActiveShiftEnd,
  type TrialShiftConfig,
  type ComputeNextActionInput,
} from "../../src/modules/reports/trial-cadence";

const AR_TZ = "America/Argentina/Buenos_Aires"; // UTC-3 fijo, sin DST.
const MADRID_TZ = "Europe/Madrid"; // UTC+2 en septiembre (CEST).

const SHIFTS: TrialShiftConfig = {
  morningStart: "07:00:00",
  morningEnd: "11:00:00",
  afternoonStart: "17:00:00",
  afternoonEnd: "21:00:00",
};

function baseInput(
  overrides: Partial<ComputeNextActionInput> = {},
): ComputeNextActionInput {
  return {
    session: {
      bookingDate: "2026-09-22", // martes
      startTime: "08:00",
      endTime: "09:00",
      bookedAt: new Date("2026-09-15T12:00:00Z"),
      timezone: AR_TZ,
    },
    followup: { m1SentAt: null, m2SentAt: null, m3SentAt: null, respondedAt: null },
    attended: null,
    resolution: null,
    shifts: SHIFTS,
    retryHours: 24,
    isFinalAllowedSession: false,
    cadenceStartDate: null,
    now: new Date("2026-09-15T12:00:00Z"),
    ...overrides,
  };
}

describe("hasMorningShift / hasAfternoonShift (días hábiles)", () => {
  it("lun-vie tienen los dos turnos; sáb solo mañana; dom ninguno", () => {
    // 1=lun .. 7=dom
    for (const dow of [1, 2, 3, 4, 5]) {
      expect(hasMorningShift(dow)).toBe(true);
      expect(hasAfternoonShift(dow)).toBe(true);
    }
    expect(hasMorningShift(6)).toBe(true); // sábado
    expect(hasAfternoonShift(6)).toBe(false);
    expect(hasMorningShift(7)).toBe(false); // domingo
    expect(hasAfternoonShift(7)).toBe(false);
  });
});

describe("computeNextAction — M1 (recordatorio)", () => {
  it("sesión de tarde → ventana = turno mañana del MISMO día", () => {
    const input = baseInput({
      session: {
        bookingDate: "2026-09-22", // martes
        startTime: "18:00",
        endTime: "19:00",
        bookedAt: new Date("2026-09-15T12:00:00Z"),
        timezone: AR_TZ,
      },
      now: new Date("2026-09-22T10:00:00.000Z"), // 07:00 AR = ventana abre
    });
    const action = computeNextAction(input);
    expect(action).not.toBeNull();
    expect(action!.code).toBe("M1");
    expect(action!.dueAt).toBe("2026-09-22T10:00:00.000Z"); // 07:00 AR
    expect(action!.windowEnd).toBe("2026-09-22T14:00:00.000Z"); // 11:00 AR
    expect(action!.status).toBe("due");
  });

  it("sesión de mañana un martes → ventana = turno tarde del lunes anterior", () => {
    const input = baseInput({
      session: {
        bookingDate: "2026-09-22", // martes
        startTime: "08:00",
        endTime: "09:00",
        bookedAt: new Date("2026-09-01T12:00:00Z"),
        timezone: AR_TZ,
      },
      now: new Date("2026-09-21T20:00:00.000Z"), // lunes 17:00 AR
    });
    const action = computeNextAction(input);
    expect(action!.dueAt).toBe("2026-09-21T20:00:00.000Z"); // lunes 17:00 AR
    expect(action!.windowEnd).toBe("2026-09-22T00:00:00.000Z"); // lunes 21:00 AR
    expect(action!.status).toBe("due");
  });

  it("sesión de mañana un LUNES → ventana = turno mañana del SÁBADO anterior (domingo no tiene turno)", () => {
    const input = baseInput({
      session: {
        bookingDate: "2026-09-28", // lunes
        startTime: "08:00",
        endTime: "09:00",
        bookedAt: new Date("2026-09-01T12:00:00Z"),
        timezone: AR_TZ,
      },
      now: new Date("2026-09-26T10:00:00.000Z"), // sábado 07:00 AR
    });
    const action = computeNextAction(input);
    expect(action!.dueAt).toBe("2026-09-26T10:00:00.000Z"); // sábado 07:00 AR
    expect(action!.windowEnd).toBe("2026-09-26T14:00:00.000Z"); // sábado 11:00 AR
    expect(action!.status).toBe("due");
  });

  it("upcoming antes de dueAt; overdue después de windowEnd (pero antes de que empiece la clase)", () => {
    const input = baseInput({
      session: {
        bookingDate: "2026-09-28",
        startTime: "08:00",
        endTime: "09:00",
        bookedAt: new Date("2026-09-01T12:00:00Z"),
        timezone: AR_TZ,
      },
    });
    const upcoming = computeNextAction({
      ...input,
      now: new Date("2026-09-26T09:59:59.000Z"),
    });
    expect(upcoming!.status).toBe("upcoming");

    const overdue = computeNextAction({
      ...input,
      now: new Date("2026-09-26T15:00:00.000Z"), // sábado 12:00 AR, tras el fin del turno mañana
    });
    expect(overdue!.status).toBe("overdue");
    expect(overdue!.code).toBe("M1"); // sigue siendo M1: la clase (lunes) no empezó
  });

  it('agendada DESPUÉS de que cerró su ventana → "vence ahora" (dueAt = bookedAt)', () => {
    // Sesión de tarde (ventana = mañana del mismo día), pero se agendó a las
    // 15:00 AR — después de que la ventana de mañana (07-11) ya cerró.
    const bookedAt = new Date("2026-09-22T18:00:00.000Z"); // 15:00 AR
    const input = baseInput({
      session: {
        bookingDate: "2026-09-22",
        startTime: "18:00",
        endTime: "19:00",
        bookedAt,
        timezone: AR_TZ,
      },
      now: bookedAt,
    });
    const action = computeNextAction(input);
    expect(action!.dueAt).toBe(bookedAt.toISOString());
    // La ventana normal (07-11) ya había cerrado antes de que existiera la
    // sesión — status queda 'overdue' desde el instante en que se crea
    // (interpretación documentada en trial-cadence.ts: dueAt > windowEnd).
    expect(action!.status).toBe("overdue");
  });

  it("se saltea al empezar la clase sin bloquear M2 (vuelve null porque la clase sigue sin terminar)", () => {
    const input = baseInput({
      session: {
        bookingDate: "2026-09-22",
        startTime: "08:00",
        endTime: "09:00",
        bookedAt: new Date("2026-09-01T12:00:00Z"),
        timezone: AR_TZ,
      },
      now: new Date("2026-09-22T11:05:00.000Z"), // 08:05 AR — clase ya empezó
      attended: null, // clase en curso, todavía sin resolver
    });
    expect(computeNextAction(input)).toBeNull();
  });

  it("Barcelona (Europe/Madrid) calcula la ventana en SU huso, distinto de Mar del Plata", () => {
    const arInput = baseInput({
      session: {
        bookingDate: "2026-09-22",
        startTime: "18:00",
        endTime: "19:00",
        bookedAt: new Date("2026-09-01T00:00:00Z"),
        timezone: AR_TZ,
      },
      now: new Date("2026-09-22T10:00:00.000Z"),
    });
    const bcnInput = baseInput({
      session: {
        bookingDate: "2026-09-22",
        startTime: "18:00",
        endTime: "19:00",
        bookedAt: new Date("2026-09-01T00:00:00Z"),
        timezone: MADRID_TZ,
      },
      now: new Date("2026-09-22T05:00:00.000Z"),
    });
    const ar = computeNextAction(arInput);
    const bcn = computeNextAction(bcnInput);
    // AR: 07:00 AR (UTC-3) = 10:00Z. Madrid en septiembre = CEST (UTC+2): 07:00
    // Madrid = 05:00Z. Mismo horario de pared, instantes UTC distintos.
    expect(ar!.dueAt).toBe("2026-09-22T10:00:00.000Z");
    expect(bcn!.dueAt).toBe("2026-09-22T05:00:00.000Z");
  });
});

describe("computeNextAction — M2a / M2b (post-sesión)", () => {
  const attendedBase = baseInput({
    session: {
      bookingDate: "2026-09-22",
      startTime: "08:00",
      endTime: "09:00",
      bookedAt: new Date("2026-09-01T12:00:00Z"),
      timezone: AR_TZ,
    },
    followup: {
      m1SentAt: new Date("2026-09-21T20:00:00Z"),
      m2SentAt: null,
      m3SentAt: null,
      respondedAt: null,
    },
  });

  it("M2a (Asistió): due desde el fin de la clase hasta el fin del turno", () => {
    const dueNow = computeNextAction({
      ...attendedBase,
      attended: true,
      now: new Date("2026-09-22T12:00:00.000Z"), // 09:00 AR = fin de clase
    });
    expect(dueNow!.code).toBe("M2a");
    expect(dueNow!.dueAt).toBe("2026-09-22T12:00:00.000Z");
    expect(dueNow!.windowEnd).toBe("2026-09-22T14:00:00.000Z"); // 11:00 AR
    expect(dueNow!.status).toBe("due");

    const overdue = computeNextAction({
      ...attendedBase,
      attended: true,
      now: new Date("2026-09-22T15:00:00.000Z"), // 12:00 AR, tras el turno
    });
    expect(overdue!.status).toBe("overdue");
    expect(overdue!.code).toBe("M2a");
  });

  it("M2b (No asistió): mismo cálculo de ventana, código distinto", () => {
    const action = computeNextAction({
      ...attendedBase,
      attended: false,
      now: new Date("2026-09-22T12:30:00.000Z"),
    });
    expect(action!.code).toBe("M2b");
    expect(action!.status).toBe("due");
  });

  it("no hay M2 mientras la clase no terminó (attended=null)", () => {
    const action = computeNextAction({
      ...attendedBase,
      attended: null,
      now: new Date("2026-09-22T11:30:00.000Z"), // 08:30 AR, clase en curso
    });
    expect(action).toBeNull();
  });
});

describe("computeNextAction — M3a / M3b (reintento a las retryHours)", () => {
  const m2SentAt = new Date("2026-09-22T12:00:00Z");
  const withM2 = baseInput({
    followup: { m1SentAt: new Date("2026-09-21T20:00:00Z"), m2SentAt, m3SentAt: null, respondedAt: null },
    retryHours: 24,
  });

  it("M3a upcoming antes de las 24h, due exactamente a las 24h", () => {
    const upcoming = computeNextAction({
      ...withM2,
      attended: true,
      now: new Date("2026-09-23T11:59:59.000Z"),
    });
    expect(upcoming!.code).toBe("M3a");
    expect(upcoming!.status).toBe("upcoming");
    expect(upcoming!.dueAt).toBe("2026-09-23T12:00:00.000Z");
    // dueAt 09:00 AR (12:00 UTC) cae DENTRO del turno mañana (07-11 AR) del
    // 23/09 → windowEnd = fin de ESE turno (11:00 AR = 14:00 UTC).
    expect(upcoming!.windowEnd).toBe("2026-09-23T14:00:00.000Z");

    const due = computeNextAction({
      ...withM2,
      attended: true,
      now: new Date("2026-09-23T12:00:00.000Z"),
    });
    expect(due!.status).toBe("due");
  });

  it("M3 pasa a 'overdue' al terminar el turno en el que vence (2026-09-26: ya NO se queda en 'due' para siempre)", () => {
    // dueAt = 2026-09-23T12:00:00Z (09:00 AR) → mismo turno mañana que arriba,
    // windowEnd = 2026-09-23T14:00:00Z (11:00 AR).
    const stillDue = computeNextAction({
      ...withM2,
      attended: false,
      now: new Date("2026-09-23T14:00:00.000Z"), // exactamente en windowEnd.
    });
    expect(stillDue!.status).toBe("due");

    const overdue = computeNextAction({
      ...withM2,
      attended: false,
      now: new Date("2026-09-23T14:00:00.001Z"), // 1ms después de windowEnd.
    });
    expect(overdue!.status).toBe("overdue");
  });

  it("M3b usa el mismo dueAt para la rama No asistió, y queda 'overdue' bien pasado el turno de vencimiento", () => {
    const action = computeNextAction({
      ...withM2,
      attended: false,
      now: new Date("2026-09-24T00:00:00.000Z"),
    });
    expect(action!.code).toBe("M3b");
    expect(action!.windowEnd).toBe("2026-09-23T14:00:00.000Z");
    expect(action!.status).toBe("overdue"); // 2026-09-26: ya NO queda en 'due' indefinidamente.
  });

  it('"Respondió" corta el reintento — sin M3 aunque no se haya enviado', () => {
    const action = computeNextAction({
      ...withM2,
      followup: { ...withM2.followup, respondedAt: new Date("2026-09-22T13:00:00Z") },
      attended: true,
      now: new Date("2026-09-24T00:00:00.000Z"),
    });
    expect(action).toBeNull();
  });

  it("tras M3 enviado → sin próxima acción", () => {
    const action = computeNextAction({
      ...withM2,
      followup: { ...withM2.followup, m3SentAt: new Date("2026-09-23T12:00:00Z") },
      attended: true,
      now: new Date("2026-09-25T00:00:00.000Z"),
    });
    expect(action).toBeNull();
  });

  it("M3b NO se ofrece en la última reagenda permitida (aunque falten los guardrails de resolution)", () => {
    const action = computeNextAction({
      ...withM2,
      attended: false,
      isFinalAllowedSession: true,
      now: new Date("2026-09-24T00:00:00.000Z"),
    });
    expect(action).toBeNull();
  });
});

describe("computeNextAction — cierre de rama y corte go-live", () => {
  it.each(["ganada", "perdida", "reagendada"] as const)(
    "resolution=%s nunca muestra próxima acción",
    (resolution) => {
      const action = computeNextAction(
        baseInput({ resolution, now: new Date("2026-09-15T13:00:00Z") }),
      );
      expect(action).toBeNull();
    },
  );

  it("corte go-live: sesión ANTERIOR a cadence_start_date no genera acción", () => {
    const action = computeNextAction(
      baseInput({
        session: {
          bookingDate: "2026-09-10",
          startTime: "08:00",
          endTime: "09:00",
          bookedAt: new Date("2026-09-01T12:00:00Z"),
          timezone: AR_TZ,
        },
        cadenceStartDate: "2026-09-15",
        now: new Date("2026-09-10T09:00:00Z"),
      }),
    );
    expect(action).toBeNull();
  });

  it("sesión el MISMO día del corte (no estrictamente anterior) sigue generando acción", () => {
    const action = computeNextAction(
      baseInput({
        session: {
          bookingDate: "2026-09-15",
          startTime: "18:00",
          endTime: "19:00",
          bookedAt: new Date("2026-09-01T00:00:00Z"),
          timezone: AR_TZ,
        },
        cadenceStartDate: "2026-09-15",
        now: new Date("2026-09-15T10:00:00Z"),
      }),
    );
    expect(action).not.toBeNull();
  });

  it("cadenceStartDate=null nunca corta", () => {
    const action = computeNextAction(
      baseInput({
        session: {
          bookingDate: "2020-01-01",
          startTime: "18:00",
          endTime: "19:00",
          bookedAt: new Date("2019-12-01T00:00:00Z"),
          timezone: AR_TZ,
        },
        cadenceStartDate: null,
        now: new Date("2020-01-01T10:00:00Z"),
      }),
    );
    expect(action).not.toBeNull();
  });
});

describe("deriveSessionStatus", () => {
  it("agendada: sin asistencia resuelta, sin lead, sin hija", () => {
    expect(
      deriveSessionStatus({
        hasRescheduleChild: false,
        leadStatus: "en_seguimiento",
        attended: null,
        isFinalAllowedSession: false,
      }),
    ).toBe("agendada");
  });

  it("asistio / no_asistio siguen a `attended`", () => {
    expect(
      deriveSessionStatus({
        hasRescheduleChild: false,
        leadStatus: "en_seguimiento",
        attended: true,
        isFinalAllowedSession: false,
      }),
    ).toBe("asistio");
    expect(
      deriveSessionStatus({
        hasRescheduleChild: false,
        leadStatus: "en_seguimiento",
        attended: false,
        isFinalAllowedSession: false,
      }),
    ).toBe("no_asistio");
  });

  it("no_asistio + última reagenda permitida → perdida derivada (motivo implícito)", () => {
    expect(
      deriveSessionStatus({
        hasRescheduleChild: false,
        leadStatus: "en_seguimiento",
        attended: false,
        isFinalAllowedSession: true,
      }),
    ).toBe("perdida");
  });

  it("ganada / perdida siguen lead_status cuando no hay hija de reagenda", () => {
    expect(
      deriveSessionStatus({
        hasRescheduleChild: false,
        leadStatus: "ganado",
        attended: true,
        isFinalAllowedSession: false,
      }),
    ).toBe("ganada");
    expect(
      deriveSessionStatus({
        hasRescheduleChild: false,
        leadStatus: "perdido",
        attended: false,
        isFinalAllowedSession: false,
      }),
    ).toBe("perdida");
  });

  it("reagendada tiene prioridad SIEMPRE, incluso con lead ya ganado/perdido", () => {
    expect(
      deriveSessionStatus({
        hasRescheduleChild: true,
        leadStatus: "ganado",
        attended: false,
        isFinalAllowedSession: false,
      }),
    ).toBe("reagendada");
    expect(
      deriveSessionStatus({
        hasRescheduleChild: true,
        leadStatus: "perdido",
        attended: null,
        isFinalAllowedSession: false,
      }),
    ).toBe("reagendada");
  });
});

describe("resolveActiveShiftEnd — turno actual o próximo (para 'Pendientes de este turno')", () => {
  it("dentro del turno mañana → fin del turno mañana de HOY", () => {
    // Martes 2026-09-22, 08:00 AR = 11:00Z.
    const end = resolveActiveShiftEnd(
      new Date("2026-09-22T11:00:00Z"),
      AR_TZ,
      SHIFTS,
    );
    expect(end.toISOString()).toBe("2026-09-22T14:00:00.000Z"); // 11:00 AR
  });

  it("entre turnos (12:00 AR) → fin del turno TARDE de hoy", () => {
    const end = resolveActiveShiftEnd(
      new Date("2026-09-22T15:00:00Z"), // 12:00 AR
      AR_TZ,
      SHIFTS,
    );
    expect(end.toISOString()).toBe("2026-09-23T00:00:00.000Z"); // 21:00 AR
  });

  it("tras el turno tarde de un viernes → sábado (solo mañana), no domingo", () => {
    // Viernes 2026-09-25, 22:00 AR (tras el cierre 21:00).
    const end = resolveActiveShiftEnd(
      new Date("2026-09-26T01:00:00Z"),
      AR_TZ,
      SHIFTS,
    );
    expect(end.toISOString()).toBe("2026-09-26T14:00:00.000Z"); // sábado 11:00 AR
  });

  it("tras el turno mañana de un sábado → salta el domingo, cae en el lunes", () => {
    const end = resolveActiveShiftEnd(
      new Date("2026-09-26T15:00:00Z"), // sábado 12:00 AR
      AR_TZ,
      SHIFTS,
    );
    expect(end.toISOString()).toBe("2026-09-28T14:00:00.000Z"); // lunes 11:00 AR
  });
});
