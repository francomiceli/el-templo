/**
 * Fase 201 plan 201-25: parser del anexo de catalogo de Nacho
 * (`fixtures/conquer-catalogo.md`, copia byte a byte de
 * `.docs/conquer-catalogo.md`) y comparador catalogo-vs-anexo.
 *
 * Lo comparten `oracle-check.mjs` (local, sobre el SQL de las migraciones) y
 * `test/migrations/0293-conquer-anexo.test.ts` (CI, sobre la base): una sola
 * comparacion, dos modelos armados distinto.
 *
 * Reglas del modulo (corre con `node --no-warnings` por type-stripping de
 * Node 22 Y desde vitest): solo importa `node:fs`, sin `enum`, sin
 * `namespace`, sin parameter properties, sin `any`.
 */
import { readFileSync } from "node:fs";

// ── Tipos del anexo ─────────────────────────────────────────────────

export type AnnexUnit = "s" | "reps";
export type AnnexLevel = "toro" | "novillo" | "ternero";
export type AnnexStepKey = "e1" | "e2" | "e3" | "hold";

export interface AnnexExercise {
  name: string;
  day: string;
  pattern: string;
  unit: AnnexUnit;
  brazosRectos: boolean;
  porLado: boolean;
}

export interface AnnexLadder {
  exercise: string;
  steps: string[];
  hold: string[];
}

export interface AnnexStartCell {
  rung: string;
  negativa: boolean;
}

export type AnnexStartRow = Record<AnnexStepKey, AnnexStartCell>;

export interface AnnexTemplateDay {
  daysCount: number;
  day: string;
  block: string;
  exercises: string[];
  finisher: string;
}

export interface AnnexMuscles {
  principales: string[];
  secundarios: string[];
}

export interface AnnexAlert {
  name: string;
  color: string;
  text: string;
  action: string;
}

export interface Annex {
  exercises: AnnexExercise[];
  ladders: AnnexLadder[];
  starts: Record<AnnexLevel, Record<string, AnnexStartRow>>;
  templates: AnnexTemplateDay[];
  comboLadder: string[];
  muscles: Record<string, AnnexMuscles>;
  alerts: AnnexAlert[];
  cutOrder: string[];
  texts: Record<string, string>;
}

// ── Modelo del catalogo (lo arma quien llama: SQL o base) ───────────

export interface ModelRung {
  code: string;
  name: string;
  position: number;
  isActive: boolean;
  unilateral: boolean;
}

export interface ModelLadder {
  code: string;
  name: string;
  isActive: boolean;
  rungs: ModelRung[];
}

export interface ModelMuscle {
  zone: string;
  role: string;
}

export interface ModelStartStep {
  step: string;
  rung: string;
  mode: string;
}

export interface ModelExercise {
  code: string;
  name: string;
  unit: string;
  ladderCode: string;
  holdLadderCode: string | null;
  brazosRectos: boolean;
  muscles: ModelMuscle[];
  startSteps: Record<AnnexLevel, ModelStartStep[]>;
}

export interface ModelTemplate {
  daysCount: number;
  sortOrder: number;
  label: string;
  exerciseCodes: string[];
  finisherText: string;
}

export interface CatalogModel {
  ladders: ModelLadder[];
  exercises: ModelExercise[];
  templates: ModelTemplate[];
}

// ── Constantes del mapeo ────────────────────────────────────────────

/** Fase 201 DA-6: musculos del anexo §10 -> zonas de BodyFigure (como la fase 200). */
export const ANNEX_MUSCLE_ZONE: Record<string, string | null> = {
  pectoral: "chest",
  "deltoides anterior": "deltoids",
  "deltoides medio": "deltoids",
  "deltoides posterior": "deltoids",
  tríceps: "triceps",
  bíceps: "biceps",
  antebrazo: "forearm",
  dorsal: "upper-back",
  romboides: "upper-back",
  "trapecio medio": "upper-back",
  "trapecio superior": "trapezius",
  core: "abs",
  // La fase 200 marca el serrato como zona null (no se dibuja).
  serrato: null,
};

/** Bullet de §1: por lado aplica a one arm, OAP asistida y archer. */
export const UNILATERAL_RUNG_NAMES = ["one arm", "OAP asistida", "archer"];

const COMBO_LADDER_CODE = "palanca";
const LEVELS: AnnexLevel[] = ["toro", "novillo", "ternero"];
const STEP_KEYS: AnnexStepKey[] = ["e1", "e2", "e3", "hold"];
const NEGATIVA_SEP = " · ";

// ── Parser ──────────────────────────────────────────────────────────

interface MdTable {
  section: number;
  subtitle: string | null;
  rows: string[][];
}

function cleanCell(cell: string): string {
  return cell.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function parseRow(line: string): string[] {
  return line.split("|").slice(1, -1).map(cleanCell);
}

function isSeparatorRow(line: string): boolean {
  return /^\|\s*:?-{3,}/.test(line);
}

/** Recorre el .md y devuelve las tablas con su seccion y subtitulo. */
function collectTables(lines: string[]): MdTable[] {
  const tables: MdTable[] = [];
  let section = 0;
  let subtitle: string | null = null;
  let current: MdTable | null = null;
  let headerSeen = false;
  for (const line of lines) {
    const sec = /^## (\d+)\./.exec(line);
    const sub = /^### (.+)$/.exec(line);
    if (sec || sub || !line.startsWith("|")) {
      current = null;
      headerSeen = false;
      if (sec) {
        section = Number(sec[1]);
        subtitle = null;
      } else if (sub) {
        subtitle = cleanCell(sub[1]);
      }
      continue;
    }
    if (!current) {
      current = { section, subtitle, rows: [] };
      tables.push(current);
    }
    if (isSeparatorRow(line)) continue;
    if (!headerSeen) {
      headerSeen = true; // encabezado: se descarta
      continue;
    }
    current.rows.push(parseRow(line));
  }
  return tables;
}

function yes(cell: string): boolean {
  return cell.trim().toLowerCase() === "sí";
}

function parseExercises(tables: MdTable[]): AnnexExercise[] {
  const table = tables.find((t) => t.section === 1);
  if (!table) return [];
  return table.rows.map((r) => ({
    name: r[0],
    day: r[1],
    pattern: r[2],
    unit: r[3] === "segundos" ? "s" : "reps",
    brazosRectos: yes(r[4]),
    porLado: yes(r[5]),
  }));
}

function parseLadders(tables: MdTable[]): AnnexLadder[] {
  return tables
    .filter((t) => t.section === 2 && t.subtitle !== null)
    .map((t) => ({
      exercise: t.subtitle ?? "",
      steps: t.rows.map((r) => r[1]).filter((c) => c !== ""),
      hold: t.rows.map((r) => r[2]).filter((c) => c !== ""),
    }));
}

function parseStartCell(cell: string): AnnexStartCell {
  const idx = cell.indexOf(NEGATIVA_SEP);
  if (idx < 0) return { rung: cell.trim(), negativa: false };
  return {
    rung: cell.slice(0, idx).trim(),
    negativa: cell.slice(idx + NEGATIVA_SEP.length).trim() === "negativa",
  };
}

function parseStarts(tables: MdTable[]): Annex["starts"] {
  const starts: Annex["starts"] = { toro: {}, novillo: {}, ternero: {} };
  for (const t of tables.filter((x) => x.section === 3)) {
    const level = (t.subtitle ?? "").toLowerCase();
    if (level !== "toro" && level !== "novillo" && level !== "ternero")
      continue;
    for (const r of t.rows) {
      starts[level][r[0]] = {
        e1: parseStartCell(r[1]),
        e2: parseStartCell(r[2]),
        e3: parseStartCell(r[3]),
        hold: parseStartCell(r[4]),
      };
    }
  }
  return starts;
}

function parseTemplates(tables: MdTable[]): AnnexTemplateDay[] {
  const out: AnnexTemplateDay[] = [];
  for (const t of tables.filter((x) => x.section === 4)) {
    const m = /^(\d+)/.exec(t.subtitle ?? "");
    if (!m) continue; // la tabla de niveles no tiene subtitulo numerico
    for (const r of t.rows) {
      out.push({
        daysCount: Number(m[1]),
        day: r[0],
        block: r[1],
        exercises: [r[2], r[3], r[4]],
        finisher: r[5],
      });
    }
  }
  return out;
}

function parseComboLadder(lines: string[]): string[] {
  for (const line of lines) {
    const m = /Progresión de arranque:.*escalera de palanca \((.+)\)/.exec(
      line,
    );
    if (m) return m[1].split(NEGATIVA_SEP).map((s) => s.trim());
  }
  return [];
}

function splitList(cell: string): string[] {
  return cell
    .split(", ")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function parseMuscles(tables: MdTable[]): Annex["muscles"] {
  const out: Annex["muscles"] = {};
  const table = tables.find((t) => t.section === 10);
  for (const r of table?.rows ?? []) {
    out[r[0]] = { principales: splitList(r[1]), secundarios: splitList(r[2]) };
  }
  return out;
}

function parseAlerts(tables: MdTable[]): AnnexAlert[] {
  const table = tables.find((t) => t.section === 8);
  return (table?.rows ?? []).map((r) => ({
    name: r[0],
    color: r[1],
    text: r[2],
    action: r[3],
  }));
}

function parseCutOrder(lines: string[]): string[] {
  const out: string[] = [];
  let section = 0;
  for (const line of lines) {
    const sec = /^## (\d+)\./.exec(line);
    if (sec) section = Number(sec[1]);
    const item = /^\d+\. (.+)$/.exec(line);
    if (section === 8 && item) out.push(cleanCell(item[1]));
  }
  return out;
}

function parseTexts(tables: MdTable[]): Record<string, string> {
  const out: Record<string, string> = {};
  const table = tables.find((t) => t.section === 9);
  for (const r of table?.rows ?? []) out[r[0]] = r[1];
  return out;
}

/** Lee el anexo .md y lo devuelve estructurado (DA-9: se usa el .md, no el JSON). */
export function loadAnnex(mdPath: string): Annex {
  const lines = readFileSync(mdPath, "utf8").split("\n");
  const tables = collectTables(lines);
  return {
    exercises: parseExercises(tables),
    ladders: parseLadders(tables),
    starts: parseStarts(tables),
    templates: parseTemplates(tables),
    comboLadder: parseComboLadder(lines),
    muscles: parseMuscles(tables),
    alerts: parseAlerts(tables),
    cutOrder: parseCutOrder(lines),
    texts: parseTexts(tables),
  };
}

// ── Mapeos ──────────────────────────────────────────────────────────

/** Zonas de un ejercicio segun el anexo (principal gana, sin duplicados, null descartado). */
export function annexZones(m: AnnexMuscles): { zone: string; role: string }[] {
  const out: { zone: string; role: string }[] = [];
  const add = (names: string[], role: string) => {
    for (const name of names) {
      const zone = ANNEX_MUSCLE_ZONE[name];
      if (zone === undefined || zone === null) continue;
      if (out.some((o) => o.zone === zone)) continue;
      out.push({ zone, role });
    }
  };
  add(m.principales, "principal");
  add(m.secundarios, "secundario");
  return out;
}

/** Modo de un escalon de arranque segun el anexo. */
export function annexStartMode(
  cell: AnnexStartCell,
  step: AnnexStepKey,
  unit: AnnexUnit,
): string {
  if (step === "hold") return "hold";
  if (cell.negativa) return "negativa";
  if (unit === "s") return "hold";
  return "completa";
}

// ── Comparador ──────────────────────────────────────────────────────

function fmt(list: string[]): string {
  return `[${list.join(" | ")}]`;
}

function activeNames(ladder: ModelLadder | undefined): string[] {
  return [...(ladder?.rungs ?? [])]
    .filter((r) => r.isActive)
    .sort((a, b) => a.position - b.position)
    .map((r) => r.name);
}

function diffUnitAndArms(a: AnnexExercise, e: ModelExercise): string[] {
  const diffs: string[] = [];
  if (a.unit !== e.unit) {
    diffs.push(`unidad ${a.name}: anexo [${a.unit}] vs base [${e.unit}]`);
  }
  if (a.brazosRectos !== e.brazosRectos) {
    diffs.push(
      `brazos rectos ${a.name}: anexo [${a.brazosRectos}] vs base [${e.brazosRectos}]`,
    );
  }
  return diffs;
}

function diffLadders(
  a: AnnexExercise,
  l: AnnexLadder | undefined,
  e: ModelExercise,
  byCode: Map<string, ModelLadder>,
): string[] {
  const diffs: string[] = [];
  if (!l) return [`escalera ${a.name}: no figura en el anexo`];
  const main = byCode.get(e.ladderCode);
  const hold = byCode.get(e.holdLadderCode ?? e.ladderCode);
  const gotSteps = activeNames(main);
  const gotHold = activeNames(hold);
  if (fmt(gotSteps) !== fmt(l.steps)) {
    diffs.push(
      `escalera E1-E3 ${a.name}: anexo ${fmt(l.steps)} vs base ${fmt(gotSteps)}`,
    );
  }
  if (fmt(gotHold) !== fmt(l.hold)) {
    diffs.push(
      `escalera hold ${a.name}: anexo ${fmt(l.hold)} vs base ${fmt(gotHold)}`,
    );
  }
  for (const [label, ladder] of [
    ["E1-E3", main],
    ["hold", hold],
  ] as const) {
    const present = (ladder?.rungs ?? []).map((r) => r.name);
    const want = a.porLado
      ? UNILATERAL_RUNG_NAMES.filter((n) => present.includes(n))
      : [];
    const got = (ladder?.rungs ?? [])
      .filter((r) => r.unilateral)
      .map((r) => r.name);
    if (fmt([...want].sort()) !== fmt([...got].sort())) {
      diffs.push(
        `por lado ${label} ${a.name}: anexo ${fmt(want)} vs base ${fmt(got)}`,
      );
    }
  }
  return diffs;
}

function rungNameIn(
  ladder: ModelLadder | undefined,
  code: string,
): string | null {
  return ladder?.rungs.find((r) => r.code === code)?.name ?? null;
}

function diffStarts(
  annex: Annex,
  a: AnnexExercise,
  e: ModelExercise,
  byCode: Map<string, ModelLadder>,
): string[] {
  const diffs: string[] = [];
  for (const level of LEVELS) {
    const row = annex.starts[level][a.name];
    if (!row) {
      diffs.push(`arranque ${level} ${a.name}: no figura en el anexo`);
      continue;
    }
    for (const step of STEP_KEYS) {
      const start = e.startSteps[level].find((s) => s.step === step);
      const ladder = byCode.get(
        step === "hold" ? (e.holdLadderCode ?? e.ladderCode) : e.ladderCode,
      );
      const gotName = start ? rungNameIn(ladder, start.rung) : null;
      const gotMode = start ? start.mode : null;
      const wantName = row[step].rung;
      const wantMode = annexStartMode(row[step], step, a.unit);
      if (gotName !== wantName || gotMode !== wantMode) {
        diffs.push(
          `arranque ${level} ${a.name} ${step}: anexo [${wantName} ${wantMode}] vs base [${gotName} ${gotMode}]`,
        );
      }
    }
  }
  return diffs;
}

function diffMuscles(
  annex: Annex,
  a: AnnexExercise,
  e: ModelExercise,
): string[] {
  const m = annex.muscles[a.name];
  if (!m) return [`musculos ${a.name}: no figura en el anexo`];
  const key = (list: { zone: string; role: string }[]) =>
    list.map((x) => `${x.zone}:${x.role}`).sort();
  const want = key(annexZones(m));
  const got = key(e.muscles);
  if (fmt(want) !== fmt(got)) {
    return [`musculos ${a.name}: anexo ${fmt(want)} vs base ${fmt(got)}`];
  }
  return [];
}

function diffTemplates(annex: Annex, model: CatalogModel): string[] {
  const diffs: string[] = [];
  const nameByCode = new Map(model.exercises.map((e) => [e.code, e.name]));
  const wanted = new Set(annex.templates.map((t) => t.daysCount));
  for (const days of [...wanted].sort()) {
    const want = annex.templates.filter((t) => t.daysCount === days);
    const got = model.templates
      .filter((t) => t.daysCount === days)
      .sort((x, y) => x.sortOrder - y.sortOrder);
    if (want.length !== got.length) {
      diffs.push(
        `plantilla ${days} dias: anexo [${want.length} dias] vs base [${got.length} dias]`,
      );
      continue;
    }
    want.forEach((w, i) => {
      const g = got[i];
      const gotNames = g.exerciseCodes.map((c) => nameByCode.get(c) ?? `?${c}`);
      if (g.label !== w.block) {
        diffs.push(
          `plantilla ${days} dias dia ${i + 1} bloque: anexo [${w.block}] vs base [${g.label}]`,
        );
      }
      if (fmt(gotNames) !== fmt(w.exercises)) {
        diffs.push(
          `plantilla ${days} dias ${w.block} ejercicios: anexo ${fmt(w.exercises)} vs base ${fmt(gotNames)}`,
        );
      }
      if (g.finisherText !== w.finisher) {
        diffs.push(
          `finisher ${days} dias ${w.block}: anexo [${w.finisher}] vs base [${g.finisherText}]`,
        );
      }
    });
  }
  for (const days of new Set(model.templates.map((t) => t.daysCount))) {
    if (!wanted.has(days)) {
      diffs.push(`plantilla ${days} dias: anexo [no existe] vs base [existe]`);
    }
  }
  return diffs;
}

/** Diferencias entre el anexo y el catalogo (vacio = igual). */
export function annexDiffs(annex: Annex, model: CatalogModel): string[] {
  const diffs: string[] = [];
  const byCode = new Map(model.ladders.map((l) => [l.code, l]));
  for (const a of annex.exercises) {
    const e = model.exercises.find((x) => x.name === a.name);
    if (!e) {
      diffs.push(`ejercicio ${a.name}: anexo [existe] vs base [falta]`);
      continue;
    }
    const l = annex.ladders.find((x) => x.exercise === a.name);
    diffs.push(...diffUnitAndArms(a, e));
    diffs.push(...diffLadders(a, l, e, byCode));
    diffs.push(...diffStarts(annex, a, e, byCode));
    diffs.push(...diffMuscles(annex, a, e));
  }
  diffs.push(...diffTemplates(annex, model));
  const combo = activeNames(byCode.get(COMBO_LADDER_CODE));
  if (fmt(combo) !== fmt(annex.comboLadder)) {
    diffs.push(
      `escalera de combos: anexo ${fmt(annex.comboLadder)} vs base ${fmt(combo)}`,
    );
  }
  return diffs;
}
