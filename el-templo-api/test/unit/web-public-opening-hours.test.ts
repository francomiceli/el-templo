import { describe, it, expect } from "vitest";
import {
  mergeIntervals,
  computeOpeningHours,
  slugify,
} from "../../src/modules/web-public/opening-hours";

describe("mergeIntervals", () => {
  it("fusiona franjas contiguas", () => {
    expect(
      mergeIntervals([
        { start: "08:00", end: "09:00" },
        { start: "09:00", end: "10:00" },
      ]),
    ).toEqual([{ opens: "08:00", closes: "10:00" }]);
  });

  it("fusiona franjas solapadas", () => {
    expect(
      mergeIntervals([
        { start: "08:00", end: "09:30" },
        { start: "09:00", end: "10:00" },
      ]),
    ).toEqual([{ opens: "08:00", closes: "10:00" }]);
  });

  it("un solape donde la segunda franja queda contenida no achica el cierre", () => {
    expect(
      mergeIntervals([
        { start: "08:00", end: "12:00" },
        { start: "09:00", end: "10:00" },
      ]),
    ).toEqual([{ opens: "08:00", closes: "12:00" }]);
  });

  it("hueco de 59 min se fusiona", () => {
    expect(
      mergeIntervals([
        { start: "08:00", end: "09:00" },
        { start: "09:59", end: "11:00" },
      ]),
    ).toEqual([{ opens: "08:00", closes: "11:00" }]);
  });

  it("hueco de 60 min separa en dos franjas", () => {
    expect(
      mergeIntervals([
        { start: "08:00", end: "09:00" },
        { start: "10:00", end: "11:00" },
      ]),
    ).toEqual([
      { opens: "08:00", closes: "09:00" },
      { opens: "10:00", closes: "11:00" },
    ]);
  });

  it("respeta un gapMin distinto", () => {
    const slots = [
      { start: "08:00", end: "09:00" },
      { start: "09:30", end: "10:00" },
    ];
    expect(mergeIntervals(slots, 30)).toHaveLength(2);
    expect(mergeIntervals(slots, 31)).toHaveLength(1);
  });

  it("ordena entradas desordenadas por apertura", () => {
    expect(
      mergeIntervals([
        { start: "18:00", end: "19:00" },
        { start: "07:00", end: "08:00" },
      ]),
    ).toEqual([
      { opens: "07:00", closes: "08:00" },
      { opens: "18:00", closes: "19:00" },
    ]);
  });

  it("lista vacía devuelve lista vacía", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("descarta horas inválidas sin lanzar", () => {
    expect(
      mergeIntervals([
        { start: "8:00", end: "09:00" },
        { start: "25:00", end: "26:00" },
        { start: "aa:bb", end: "10:00" },
        { start: "08:60", end: "10:00" },
        { start: "10:00", end: "11:00" },
      ]),
    ).toEqual([{ opens: "10:00", closes: "11:00" }]);
  });

  it("descarta franjas con fin menor o igual al inicio", () => {
    expect(
      mergeIntervals([
        { start: "10:00", end: "10:00" },
        { start: "11:00", end: "10:00" },
        { start: "12:00", end: "13:00" },
      ]),
    ).toEqual([{ opens: "12:00", closes: "13:00" }]);
  });
});

describe("computeOpeningHours", () => {
  it("agrupa por día, ordenado por día y luego por apertura", () => {
    const result = computeOpeningHours([
      { dayOfWeek: 2, startTime: "18:00", endTime: "19:00" },
      { dayOfWeek: 1, startTime: "18:00", endTime: "19:00" },
      { dayOfWeek: 1, startTime: "07:00", endTime: "08:00" },
      { dayOfWeek: 2, startTime: "07:00", endTime: "08:00" },
    ]);
    expect(result).toEqual([
      { dayOfWeek: 1, opens: "07:00", closes: "08:00" },
      { dayOfWeek: 1, opens: "18:00", closes: "19:00" },
      { dayOfWeek: 2, opens: "07:00", closes: "08:00" },
      { dayOfWeek: 2, opens: "18:00", closes: "19:00" },
    ]);
  });

  it("no fusiona franjas de días distintos", () => {
    const result = computeOpeningHours([
      { dayOfWeek: 1, startTime: "08:00", endTime: "09:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "10:00" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("fusiona las clases solapadas de un mismo día", () => {
    expect(
      computeOpeningHours([
        { dayOfWeek: 3, startTime: "08:00", endTime: "09:00" },
        { dayOfWeek: 3, startTime: "08:30", endTime: "09:30" },
      ]),
    ).toEqual([{ dayOfWeek: 3, opens: "08:00", closes: "09:30" }]);
  });

  it("sin clases devuelve vacío", () => {
    expect(computeOpeningHours([])).toEqual([]);
  });
});

describe("slugify", () => {
  it.each([
    ["Actividades con Aura", "actividades-con-aura"],
    ["Constitución", "constitucion"],
    ["  Yoga  ", "yoga"],
    ["Juan B. Justo", "juan-b-justo"],
    ["A -- B", "a-b"],
    ["Ñandú!!", "nandu"],
    ["", ""],
  ])("slugify(%j) = %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
