/**
 * Tests de utils/group-schedule.ts (funcion pura). el-templo-web no tiene
 * vitest: usa el runner nativo de Node (>= 22.18, importa .ts directo).
 *
 *   node --test scripts/group-schedule.test.mjs     (o: pnpm test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  formatDays,
  formatDuration,
  groupSchedule,
} from "../utils/group-schedule.ts";

const slot = (dayOfWeek, startTime, endTime, activity) => ({
  dayOfWeek,
  startTime,
  endTime,
  activity,
});

const hourly = (day, activity, starts) =>
  starts.map((s) => {
    const h = Number(s.slice(0, 2));
    return slot(day, s, `${String(h + 1).padStart(2, "0")}:${s.slice(3)}`, activity);
  });

test("grilla vacia -> sin grupos", () => {
  assert.deepEqual(groupSchedule([]), []);
});

test("lunes a viernes iguales + sabado distinto", () => {
  const starts = ["07:00", "08:00", "09:00", "17:00"];
  const schedule = [
    ...[1, 2, 3, 4, 5].flatMap((d) => hourly(d, "General", starts)),
    ...hourly(6, "ROM", ["09:00", "10:00", "11:00"]),
  ];
  const groups = groupSchedule(schedule);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Lunes a viernes");
  assert.deepEqual(groups[0].days, [1, 2, 3, 4, 5]);
  assert.deepEqual(groups[0].rows, [
    { activity: "General", times: starts, durationMinutes: 60, durationLabel: null },
  ]);
  assert.equal(groups[1].label, "Sábado");
  assert.deepEqual(groups[1].rows[0].times, ["09:00", "10:00", "11:00"]);
});

test("dias no consecutivos -> lista con 'y'", () => {
  const schedule = [1, 3, 5].flatMap((d) => hourly(d, "General", ["10:00"]));
  const groups = groupSchedule(schedule);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Lunes, miércoles y viernes");
});

test("corrida de 3+ mas dia suelto y corrida de 2", () => {
  assert.equal(formatDays([1, 2, 3, 5]), "Lunes a miércoles y viernes");
  assert.equal(formatDays([1, 2]), "Lunes y martes");
  assert.equal(formatDays([6, 7]), "Sábado y domingo");
  assert.equal(formatDays([2]), "Martes");
});

test("un dia con una hora distinta NO se agrupa", () => {
  const schedule = [
    ...hourly(1, "General", ["08:00", "19:00"]),
    ...hourly(2, "General", ["08:00", "19:00"]),
    ...hourly(3, "General", ["08:00", "20:00"]),
  ];
  const groups = groupSchedule(schedule);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Lunes y martes", "Miércoles"],
  );
});

test("misma actividad pero distinta actividad en otro dia no se agrupa", () => {
  const schedule = [
    ...hourly(1, "General", ["10:00"]),
    ...hourly(2, "ROM", ["10:00"]),
  ];
  assert.equal(groupSchedule(schedule).length, 2);
});

test("varias actividades en un dia: una fila por actividad, cronologicas", () => {
  const schedule = [
    ...hourly(1, "ROM", ["18:00"]),
    ...hourly(1, "General", ["09:00", "07:00"]),
    ...hourly(1, "ROM", ["12:00"]),
  ];
  const [g] = groupSchedule(schedule);
  assert.deepEqual(
    g.rows.map((r) => [r.activity, r.times]),
    [
      ["General", ["07:00", "09:00"]],
      ["ROM", ["12:00", "18:00"]],
    ],
  );
});

test("dias agrupados solo si TODAS las actividades coinciden", () => {
  const schedule = [
    ...hourly(1, "General", ["10:00"]),
    ...hourly(1, "ROM", ["18:00"]),
    ...hourly(2, "General", ["10:00"]),
  ];
  assert.equal(groupSchedule(schedule).length, 2);
});

test("duracion distinta de 60 min se muestra", () => {
  const [g] = groupSchedule([slot(1, "09:00", "09:45", "Movilidad")]);
  assert.equal(g.rows[0].durationMinutes, 45);
  assert.equal(g.rows[0].durationLabel, "45 min");
  const [p] = groupSchedule([slot(6, "10:00", "12:00", "Al aire libre")]);
  assert.equal(p.rows[0].durationLabel, "2 h");
});

test("misma actividad con duraciones distintas: filas separadas, todas con duracion", () => {
  const [g] = groupSchedule([
    slot(1, "08:00", "09:00", "General"),
    slot(1, "10:00", "10:45", "General"),
  ]);
  assert.equal(g.rows.length, 2);
  assert.deepEqual(
    g.rows.map((r) => [r.times, r.durationLabel]),
    [
      [["08:00"], "1 h"],
      [["10:00"], "45 min"],
    ],
  );
});

test("duplicados exactos se deduplican; dias fuera de rango se ignoran", () => {
  const groups = groupSchedule([
    slot(1, "10:00", "11:00", "General"),
    slot(1, "10:00", "11:00", "General"),
    slot(9, "10:00", "11:00", "General"),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows[0].times, ["10:00"]);
});

test("el orden de entrada no importa", () => {
  const a = [slot(5, "10:00", "11:00", "G"), slot(1, "10:00", "11:00", "G")];
  const b = [...a].reverse();
  assert.deepEqual(groupSchedule(a), groupSchedule(b));
});

test("formatDuration", () => {
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(90), "1 h 30 min");
  assert.equal(formatDuration(45), "45 min");
});

test("fixture web-data.json: cada sede agrupa sin perder clases", (t) => {
  const path = fileURLToPath(
    new URL("../data/generated/web-data.json", import.meta.url),
  );
  if (!existsSync(path)) return t.skip("sin data/generated/web-data.json");
  const data = JSON.parse(readFileSync(path, "utf8"));
  for (const sede of data.sedes) {
    const groups = groupSchedule(sede.schedule);
    const total = groups.reduce(
      (n, g) => n + g.days.length * g.rows.reduce((m, r) => m + r.times.length, 0),
      0,
    );
    const distinct = new Set(
      sede.schedule.map((s) => `${s.dayOfWeek}|${s.activity}|${s.startTime}`),
    ).size;
    assert.equal(total, distinct, sede.slug);
  }
});
