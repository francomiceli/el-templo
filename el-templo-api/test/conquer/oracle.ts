/**
 * Fase 201 (Conquer v2): carga el oraculo `conquer-app.html` (la app de Nacho)
 * dentro de `node:vm` y expone sus datos (`LAD`, `DIAS`, `CMB`) y su funcion
 * `next()`, para los tests de paridad de la semilla (plan 201-02) y el test
 * diferencial del motor (plan 201-03).
 *
 * Reglas del modulo:
 *  - Solo importa `node:vm` y `node:fs` (corre con `node --no-warnings` por
 *    type-stripping de Node 22, ver `oracle-check.mjs`).
 *  - Sin `enum`, sin `namespace`, sin parameter properties.
 *  - Todo lo que sale del contexto vm se clona por JSON (otro realm) y se
 *    valida con type guards chicos: nunca `any`.
 */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

export type OracleUnit = "reps" | "s";

export interface OracleExercise {
  /** Nombre del ejercicio (`DIAS[d].ex[i].n`). */
  n: string;
  /** Code de la escalera (`LAD[lad]`). */
  lad: string;
  /** Unidad: repeticiones o segundos. */
  tipo: OracleUnit;
  /** Escalones E1, E2, E3 como `[nombreDePeldano, modo]`. */
  st: Array<[string, string]>;
  /** Peldano del hold final. */
  hold: string;
}

export interface OracleDay {
  wd: number;
  tipo: string;
  combo: string[];
  fin: string;
  ex: OracleExercise[];
}

export interface OracleNext {
  obj: number | null;
  est: string;
}

export interface Oracle {
  /** Escaleras: code -> nombres de peldano de MAS dificil a MAS facil. */
  LAD: Record<string, string[]>;
  /** Dias del metodo (4 dias de Toro): Plancha, Front, Vertical, Dominadas. */
  DIAS: Record<string, OracleDay>;
  /** Combos de apertura / sabado. */
  CMB: Record<string, string[]>;
  /**
   * Objetivo y estado del oraculo para un historial de marcas del escalon E1
   * (una sesion por valor, fechas crecientes). `reps` usa Planche press,
   * `s` usa Planche hold.
   */
  next(history: readonly number[], unit: OracleUnit): OracleNext;
}

type Fn = (...args: unknown[]) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isUnit(value: unknown): value is OracleUnit {
  return value === "reps" || value === "s";
}

function isStepPair(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
  );
}

function isExercise(value: unknown): value is OracleExercise {
  return (
    isRecord(value) &&
    typeof value.n === "string" &&
    typeof value.lad === "string" &&
    isUnit(value.tipo) &&
    Array.isArray(value.st) &&
    value.st.every(isStepPair) &&
    typeof value.hold === "string"
  );
}

function isDay(value: unknown): value is OracleDay {
  return (
    isRecord(value) &&
    typeof value.wd === "number" &&
    typeof value.tipo === "string" &&
    isStringArray(value.combo) &&
    typeof value.fin === "string" &&
    Array.isArray(value.ex) &&
    value.ex.every(isExercise)
  );
}

function isRecordOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(guard);
}

/** Clona por JSON: saca el valor del realm de vm y lo deja como dato plano. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function isFn(value: unknown): value is Fn {
  return typeof value === "function";
}

/** Fecha ISO `2026-01-01` + `offset` dias, sin depender de la zona horaria. */
function isoDay(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

function extractScript(html: string): string {
  const afterOpen = html.split("<script>")[1];
  const script =
    afterOpen === undefined ? undefined : afterOpen.split("</script>")[0];
  if (script === undefined || script.length === 0) {
    throw new Error("conquer-app.html: no se encontro el <script>");
  }
  return script;
}

/** Elemento de DOM falso: lo minimo que toca el render del oraculo al cargar. */
function fakeElement(): Record<string, unknown> {
  return {
    textContent: "",
    innerHTML: "",
    classList: { add() {}, remove() {} },
    dataset: {},
    querySelector: () => null,
    setAttribute() {},
  };
}

function buildSandbox(): Record<string, unknown> {
  return {
    document: {
      getElementById: fakeElement,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {},
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout() {},
    console,
  };
}

function readGlobal(ctx: Record<string, unknown>, name: string): unknown {
  return plain(ctx[name]);
}

function requireFn(ctx: Record<string, unknown>, name: string): Fn {
  const fn = ctx[name];
  if (!isFn(fn)) throw new Error(`oraculo: falta la funcion ${name}`);
  return fn;
}

function requireState(ctx: Record<string, unknown>): Record<string, unknown> {
  const state = ctx.S;
  if (!isRecord(state)) throw new Error("oraculo: falta el estado S");
  return state;
}

/** Corre `next("Plancha", idx, "e1")` con una sesion por valor del historial. */
function runNext(
  ctx: Record<string, unknown>,
  history: readonly number[],
  unit: OracleUnit,
): OracleNext {
  const state = requireState(ctx);
  const idx = unit === "reps" ? 1 : 0;
  state.perfil = requireFn(ctx, "defPerfil")();
  state.ses = history.map((v, i) => ({
    fecha: isoDay(i),
    dia: "Plancha",
    pasos: { [idx]: { e1: v } },
    prev: {},
  }));
  const result = plain(requireFn(ctx, "next")("Plancha", idx, "e1"));
  if (!isRecord(result) || typeof result.est !== "string") {
    throw new Error("oraculo: next() devolvio una forma inesperada");
  }
  const obj = typeof result.obj === "number" ? result.obj : null;
  return { obj, est: result.est };
}

/** Carga el oraculo desde la ruta del HTML (ver `fixtures/conquer-app.html`). */
export function loadOracle(htmlPath: string): Oracle {
  const script = extractScript(readFileSync(htmlPath, "utf8"));
  const ctx = buildSandbox();
  createContext(ctx);
  runInContext(script, ctx);

  const LAD = readGlobal(ctx, "LAD");
  const DIAS = readGlobal(ctx, "DIAS");
  const CMB = readGlobal(ctx, "CMB");
  if (!isRecordOf(LAD, isStringArray)) throw new Error("oraculo: LAD invalido");
  if (!isRecordOf(DIAS, isDay)) throw new Error("oraculo: DIAS invalido");
  if (!isRecordOf(CMB, isStringArray)) throw new Error("oraculo: CMB invalido");

  return {
    LAD,
    DIAS,
    CMB,
    next: (history, unit) => runNext(ctx, history, unit),
  };
}
