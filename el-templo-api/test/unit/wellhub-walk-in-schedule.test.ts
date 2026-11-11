/**
 * Regla pura de `pickWalkInSchedule`: a qué clase cae un check-in de Wellhub
 * sin reserva (±20 min del inicio, el más cercano, empate → la que empieza).
 *
 * Casos tomados de las 5 visitas sin horario de Alberti en prod (11-2026):
 * Lucila 07:04 (clase 07:00), Luigi 08:59 (09:00), Cecilia 16:55 (17:00),
 * Gonzalo 13:32 y Theo 12:17 (sin clase cerca → sin horario).
 *
 * Fechas fijas a propósito: la función es pura (no lee el reloj ni la DB).
 * America/Argentina/Buenos_Aires = UTC-3 fijo, así que 07:04 local = 10:04Z.
 */
import { describe, it, expect } from "vitest";
import { pickWalkInSchedule } from "../../src/modules/wellhub/walk-in-schedule";
import { CHECKIN_WINDOW_MS } from "../../src/modules/shared/checkin-window";

const TZ = "America/Argentina/Buenos_Aires";
const DAY = "2026-11-04";

/** Grilla General de Alberti de un día de semana (cada hora, con hueco al mediodía). */
const ALBERTI = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
].map((startTime, i) => ({ id: 100 + i, startTime }));

const idOf = (hhmm: string) => ALBERTI.find((c) => c.startTime === hhmm)!.id;

/** Instante de un "HH:MM[:SS]" local de BA en DAY. */
function at(hhmmss: string): Date {
  const [h, m, s = "0"] = hhmmss.split(":");
  return new Date(Date.UTC(2026, 10, 4, Number(h) + 3, Number(m), Number(s)));
}

describe("pickWalkInSchedule", () => {
  it("ubica los 3 check-ins reales de Alberti en su clase", () => {
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("07:04:56"))).toBe(
      idOf("07:00"),
    );
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("08:59:06"))).toBe(
      idOf("09:00"),
    );
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("16:55:11"))).toBe(
      idOf("17:00"),
    );
  });

  it("deja sin horario a quien vino fuera de clase (mediodía de Alberti)", () => {
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("13:32:12"))).toBeNull();
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("12:17:48"))).toBeNull();
  });

  it("la ventana es ±20 min inclusive, igual que el QR", () => {
    expect(CHECKIN_WINDOW_MS).toBe(20 * 60 * 1000);
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("16:40:00"))).toBe(
      idOf("17:00"),
    );
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("17:20:00"))).toBe(
      idOf("17:00"),
    );
    // Un segundo afuera de cada borde: 15:39:59 y 16:20:01 no tocan ninguna.
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("15:39:59"))).toBeNull();
    expect(pickWalkInSchedule(ALBERTI, DAY, TZ, at("16:20:01"))).toBeNull();
  });

  it("con dos clases en la ventana gana la de inicio más cercano", () => {
    const halfHour = [
      { id: 1, startTime: "18:00" },
      { id: 2, startTime: "18:30" },
    ];
    expect(pickWalkInSchedule(halfHour, DAY, TZ, at("18:12"))).toBe(1);
    expect(pickWalkInSchedule(halfHour, DAY, TZ, at("18:18"))).toBe(2);
  });

  it("empate exacto: gana la clase que está por empezar", () => {
    const halfHour = [
      { id: 1, startTime: "18:00" },
      { id: 2, startTime: "18:30" },
    ];
    expect(pickWalkInSchedule(halfHour, DAY, TZ, at("18:15"))).toBe(2);
    // El orden de las candidatas no cambia el resultado.
    expect(
      pickWalkInSchedule([...halfHour].reverse(), DAY, TZ, at("18:15")),
    ).toBe(2);
  });

  it("sin candidatas → null", () => {
    expect(pickWalkInSchedule([], DAY, TZ, at("07:00"))).toBeNull();
  });

  it("respeta la zona horaria de la sede (Madrid, con horario de invierno)", () => {
    // 2026-11-04 en Madrid = CET (UTC+1): 19:05 local = 18:05Z.
    const bcn = [{ id: 7, startTime: "19:00" }];
    const now = new Date(Date.UTC(2026, 10, 4, 18, 5));
    expect(pickWalkInSchedule(bcn, DAY, "Europe/Madrid", now)).toBe(7);
    // Leído con la tz de BA, la misma hora (15:05) no cae en la clase.
    expect(pickWalkInSchedule(bcn, DAY, TZ, now)).toBeNull();
  });
});
