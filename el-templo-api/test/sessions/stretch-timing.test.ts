/**
 * Unit puro de las reglas de tiempo y frecuencia del push de estiramiento
 * (fase 213, D-10 momento/ventana, D-11 tope y pausa, D-16 grupos).
 * Sin DB ni reloj real: las fechas se arman a partir de `todayInTz(tz)` para
 * que el test valga cualquier dia, y se corre en dos zonas (Buenos Aires y Madrid).
 * Los valores de crc32 son fijos a proposito (funcion determinista, no ids de la base).
 *
 *   pnpm exec vitest run test/sessions/stretch-timing.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  stretchArm,
  stretchBucket,
  computeStretchPushAt,
  isWithinPushWindow,
  decideFrequencyBlock,
} from "../../src/modules/sessions/stretch-timing";
import {
  buildClassDateTime,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import { shiftDate } from "../../src/modules/shared/week-dates";

const MIN = 60_000;
const ZONAS = ["America/Argentina/Buenos_Aires", "Europe/Madrid"] as const;

describe("stretchBucket / stretchArm (D-16)", () => {
  const casos: Array<[number, number, string]> = [
    [1, 40, "push_30"],
    [2, 86, "push_60"],
    [3, 52, "push_30"],
    [7, 41, "push_30"],
    [42, 24, "push_30"],
    [100, 4, "control"],
    [1234, 15, "control"],
    [8601, 69, "push_60"],
  ];

  it.each(casos)("id %i cae en el bucket %i (%s)", (id, bucket, arm) => {
    expect(stretchBucket(id)).toBe(bucket);
    expect(stretchArm(id)).toBe(arm);
  });

  it("es determinista: el mismo id da siempre el mismo grupo", () => {
    expect(stretchArm(8601)).toBe(stretchArm(8601));
    expect(stretchBucket(8601)).toBe(stretchBucket(8601));
  });

  it("los limites 20 y 60 pertenecen al grupo siguiente", () => {
    let en19: number | null = null;
    let en20: number | null = null;
    let en59: number | null = null;
    let en60: number | null = null;
    for (let id = 1; id <= 10000; id++) {
      const b = stretchBucket(id);
      if (b === 19 && en19 === null) en19 = id;
      if (b === 20 && en20 === null) en20 = id;
      if (b === 59 && en59 === null) en59 = id;
      if (b === 60 && en60 === null) en60 = id;
    }
    expect(en19).not.toBeNull();
    expect(en20).not.toBeNull();
    expect(en59).not.toBeNull();
    expect(en60).not.toBeNull();
    expect(stretchArm(en19 as number)).toBe("control");
    expect(stretchArm(en20 as number)).toBe("push_30");
    expect(stretchArm(en59 as number)).toBe("push_30");
    expect(stretchArm(en60 as number)).toBe("push_60");
  });

  it("sobre 1..10000 la proporcion es 20/40/40 con +-3 puntos", () => {
    const n = { control: 0, push_30: 0, push_60: 0 };
    for (let id = 1; id <= 10000; id++) n[stretchArm(id)]++;
    expect(Math.abs(n.control / 100 - 20)).toBeLessThanOrEqual(3);
    expect(Math.abs(n.push_30 / 100 - 40)).toBeLessThanOrEqual(3);
    expect(Math.abs(n.push_60 / 100 - 40)).toBeLessThanOrEqual(3);
  });

  it("el bucket siempre esta en 0..99", () => {
    for (let id = 1; id <= 2000; id++) {
      const b = stretchBucket(id);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });
});

describe.each(ZONAS)("computeStretchPushAt (D-10) en %s", (tz) => {
  const hoy = todayInTz(tz);
  const at = (hhmm: string): Date => buildClassDateTime(hoy, hhmm, tz);
  const push = (fin: string, offsetMinutes: number): Date | null =>
    computeStretchPushAt({
      classEndAt: at(fin),
      offsetMinutes,
      timezone: tz,
    });

  it("fin 20:00 + 60 -> 21:00", () => {
    expect(push("20:00", 60)?.getTime()).toBe(at("21:00").getTime());
  });

  it("fin 21:00 + 60 -> 21:30 (adelantado al tope)", () => {
    expect(push("21:00", 60)?.getTime()).toBe(at("21:30").getTime());
  });

  it("fin 21:00 + 30 -> 21:30 (justo en el tope)", () => {
    expect(push("21:00", 30)?.getTime()).toBe(at("21:30").getTime());
  });

  it("fin 10:00 + 60 -> 11:00", () => {
    expect(push("10:00", 60)?.getTime()).toBe(at("11:00").getTime());
  });

  it("fin 19:00 + 30 -> 19:30", () => {
    expect(push("19:00", 30)?.getTime()).toBe(at("19:30").getTime());
  });

  it("fin 22:00 + 30 -> null (21:30 queda antes del fin + 15)", () => {
    expect(push("22:00", 30)).toBeNull();
  });

  it("fin 21:20 + 30 -> null (21:30 < 21:35)", () => {
    expect(push("21:20", 30)).toBeNull();
  });

  it("fin 21:15 + 60 -> 21:30 (21:30 >= fin + 15)", () => {
    expect(push("21:15", 60)?.getTime()).toBe(at("21:30").getTime());
  });

  it("fin 07:00 + 30 -> 08:00 (silencio de la manana)", () => {
    expect(push("07:00", 30)?.getTime()).toBe(at("08:00").getTime());
  });

  it("fin 05:30 + 30 -> null (08:00 queda fuera de fin + 120)", () => {
    expect(push("05:30", 30)).toBeNull();
  });

  it("nunca devuelve un instante posterior a las 21:30 de la sede", () => {
    const tope = at("21:30").getTime();
    for (const fin of ["18:00", "20:30", "21:00", "21:10", "21:15"]) {
      for (const off of [30, 60]) {
        const r = push(fin, off);
        if (r !== null) expect(r.getTime()).toBeLessThanOrEqual(tope);
      }
    }
  });

  it("cuando hay push, es posterior o igual al fin de la clase", () => {
    for (const fin of ["07:00", "10:00", "19:00", "21:00"]) {
      const r = push(fin, 30);
      if (r !== null) {
        expect(r.getTime()).toBeGreaterThanOrEqual(at(fin).getTime());
      }
    }
  });
});

describe("computeStretchPushAt: hora de pared de cada sede", () => {
  it("fin 20:00 + 60 es 21:00 de pared en Buenos Aires y en Madrid (instantes distintos)", () => {
    const ba = "America/Argentina/Buenos_Aires";
    const mad = "Europe/Madrid";
    const rBa = computeStretchPushAt({
      classEndAt: buildClassDateTime(todayInTz(ba), "20:00", ba),
      offsetMinutes: 60,
      timezone: ba,
    });
    const rMad = computeStretchPushAt({
      classEndAt: buildClassDateTime(todayInTz(mad), "20:00", mad),
      offsetMinutes: 60,
      timezone: mad,
    });
    expect(rBa?.getTime()).toBe(
      buildClassDateTime(todayInTz(ba), "21:00", ba).getTime(),
    );
    expect(rMad?.getTime()).toBe(
      buildClassDateTime(todayInTz(mad), "21:00", mad).getTime(),
    );
    expect(rBa?.toISOString()).not.toBe(rMad?.toISOString());
  });
});

describe.each(ZONAS)("isWithinPushWindow (D-10) en %s", (tz) => {
  const fin = buildClassDateTime(todayInTz(tz), "20:00", tz);

  it("true justo en el fin de la clase", () => {
    expect(isWithinPushWindow(fin, fin)).toBe(true);
  });

  it("true a fin + 119 min", () => {
    expect(isWithinPushWindow(new Date(fin.getTime() + 119 * MIN), fin)).toBe(
      true,
    );
  });

  it("false a fin + 120 min", () => {
    expect(isWithinPushWindow(new Date(fin.getTime() + 120 * MIN), fin)).toBe(
      false,
    );
  });

  it("false a fin - 1 min", () => {
    expect(isWithinPushWindow(new Date(fin.getTime() - MIN), fin)).toBe(false);
  });
});

describe.each(ZONAS)("decideFrequencyBlock (D-11) en %s", (tz) => {
  const hoy = todayInTz(tz);
  const now = buildClassDateTime(hoy, "20:00", tz);

  /** Fila de historial encolada `n` dias locales atras (18:30 de pared). */
  const encolada = (
    n: number,
    abierta = false,
  ): {
    localDate: string;
    pushQueuedAt: Date | null;
    pushOpenedAt: Date | null;
  } => {
    const localDate = shiftDate(hoy, -n);
    const queued = buildClassDateTime(localDate, "18:30", tz);
    return {
      localDate,
      pushQueuedAt: queued,
      pushOpenedAt: abierta ? new Date(queued.getTime() + 5 * MIN) : null,
    };
  };
  const sinPush = (n: number) => ({
    localDate: shiftDate(hoy, -n),
    pushQueuedAt: null,
    pushOpenedAt: null,
  });

  it("historia vacia -> null", () => {
    expect(decideFrequencyBlock([], now, hoy)).toBeNull();
  });

  it("2 encolados en los ultimos 7 dias -> null", () => {
    expect(
      decideFrequencyBlock([encolada(1, true), encolada(2, true)], now, hoy),
    ).toBeNull();
  });

  it("3 encolados en los ultimos 7 dias -> tope_semanal", () => {
    expect(
      decideFrequencyBlock(
        [encolada(1, true), encolada(3, true), encolada(5, true)],
        now,
        hoy,
      ),
    ).toBe("tope_semanal");
  });

  it("el dia hoy-6 todavia cuenta (borde de la ventana)", () => {
    expect(
      decideFrequencyBlock(
        [encolada(1, true), encolada(2, true), encolada(6, true)],
        now,
        hoy,
      ),
    ).toBe("tope_semanal");
  });

  it("3 pero uno de hace 7 dias locales (fuera de [hoy-6, hoy]) -> null", () => {
    expect(
      decideFrequencyBlock(
        [encolada(1, true), encolada(2, true), encolada(7, true)],
        now,
        hoy,
      ),
    ).toBeNull();
  });

  it("pausa: 4 encolados sin abrir hace 3, 5, 9 y 12 dias -> pausa_sin_abrir", () => {
    expect(
      decideFrequencyBlock(
        [encolada(3), encolada(5), encolada(9), encolada(12)],
        now,
        hoy,
      ),
    ).toBe("pausa_sin_abrir");
  });

  it("los mismos 4 corridos a hace 15, 17, 20 y 23 dias -> null (la pausa vencio)", () => {
    expect(
      decideFrequencyBlock(
        [encolada(15), encolada(17), encolada(20), encolada(23)],
        now,
        hoy,
      ),
    ).toBeNull();
  });

  it("4 ultimos con uno abierto -> null", () => {
    expect(
      decideFrequencyBlock(
        [encolada(3), encolada(5, true), encolada(9), encolada(12)],
        now,
        hoy,
      ),
    ).toBeNull();
  });

  it("solo 3 encolados sin abrir (fuera de la ventana de 7 dias) -> null", () => {
    expect(
      decideFrequencyBlock([encolada(8), encolada(10), encolada(12)], now, hoy),
    ).toBeNull();
  });

  it("el orden de entrada no importa para la pausa", () => {
    expect(
      decideFrequencyBlock(
        [encolada(12), encolada(3), encolada(9), encolada(5)],
        now,
        hoy,
      ),
    ).toBe("pausa_sin_abrir");
  });

  it("filas sin pushQueuedAt (control, sin token) no cuentan para el tope", () => {
    expect(
      decideFrequencyBlock(
        [sinPush(1), sinPush(2), sinPush(3), sinPush(4), encolada(5, true)],
        now,
        hoy,
      ),
    ).toBeNull();
  });

  it("filas sin pushQueuedAt no cuentan para la pausa (no completan los 4 ni la cortan)", () => {
    // 3 encolados sin abrir + filas sin push: no son 4 encolados -> null
    expect(
      decideFrequencyBlock(
        [sinPush(2), encolada(8), sinPush(9), encolada(10), encolada(12)],
        now,
        hoy,
      ),
    ).toBeNull();
    // 4 encolados sin abrir intercalados con filas sin push -> pausa
    expect(
      decideFrequencyBlock(
        [
          encolada(3),
          sinPush(4),
          encolada(5),
          sinPush(6),
          encolada(9),
          encolada(12),
        ],
        now,
        hoy,
      ),
    ).toBe("pausa_sin_abrir");
  });

  it("un abierto anterior a los ultimos 4 no corta la pausa", () => {
    expect(
      decideFrequencyBlock(
        [
          encolada(3),
          encolada(5),
          encolada(9),
          encolada(12),
          encolada(14, true),
        ],
        now,
        hoy,
      ),
    ).toBe("pausa_sin_abrir");
  });
});
