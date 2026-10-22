// Fase 201 (Conquer v2): chequeo local SIN dependencias ni vitest.
//
// Uso: node --no-warnings test/conquer/oracle-check.mjs
//
// Secciones:
//   1. oraculo: carga conquer-app.html con node:vm (oracle.ts) y verifica un caso conocido.
//   2. semilla (plan 201-02): paridad de 0292_conquer_catalog_seed.sql con LAD y DIAS.
//   3. motor (plan 201-03): paridad de engine.ts con next() del oraculo, dorados,
//      hoja Simulacion, calibracion y A1/A3/A6/A8 (imprime MOTOR OK (<n> casos)).
//      Los planes 201-03 y 201-04 suman sus secciones al final, antes del resumen.
//
// Imprime ORACULO OK / SEMILLA OK / MOTOR OK (o la lista de diferencias) y sale con codigo 1 si algo falla.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadOracle } from "./oracle.ts";
import {
  DEFAULT_INC,
  accuracy,
  calibracion,
  caidaE1,
  nextTarget,
  pickSubir,
  selectReales,
} from "../../src/modules/conquer/engine.ts";

const HERE = new URL(".", import.meta.url);
const FIXTURE = fileURLToPath(new URL("fixtures/conquer-app.html", HERE));
const SEED_SQL = fileURLToPath(
  new URL("../../src/db/migrations/0292_conquer_catalog_seed.sql", HERE),
);

/** Salida por stdout (sin console: el chequeo es un CLI, no logging de la app). */
function out(line) {
  process.stdout.write(`${line}\n`);
}

const oracle = loadOracle(FIXTURE);
let failed = false;

// ---------------------------------------------------------------- 1. oraculo
const probe = oracle.next([6, 7, 8, 8], "reps");
if (probe.obj === 3 && probe.est === "subir") {
  out("ORACULO OK");
} else {
  failed = true;
  out(`ORACULO FALLA: next([6,7,8,8],"reps") = ${JSON.stringify(probe)}`);
}

// ---------------------------------------------------------------- 2. semilla
function seedDiffs(sql) {
  const diffs = [];
  const lines = sql.split("\n");

  const rungRe =
    /^INSERT IGNORE INTO conquer_rungs .*SELECT 1, l\.id, '([^']+)', '([^']+)', (\d+), (\d), (\d), (\d) FROM conquer_ladders l WHERE l\.tenant_id = 1 AND l\.code = '([^']+)'/;
  const exerciseRe =
    /^INSERT IGNORE INTO conquer_exercises .*SELECT 1, '([^']+)', '([^']+)', l\.id, '([^']+)', '(\[.*?\])', '(\[.*?\])', (\d+), (\d) FROM conquer_ladders l WHERE l\.tenant_id = 1 AND l\.code = '([^']+)'/;
  const templateRe =
    /^INSERT IGNORE INTO conquer_template_days .*VALUES \(1, (\d), '([^']+)', '([^']+)', (\d+), '([^']*)', '(\[.*?\])', (NULL|'[^']*')\)/;

  // code de escalera -> [{ code, name, position }]
  const rungsByLadder = new Map();
  const exercises = [];
  const templates = [];
  for (const line of lines) {
    let m = rungRe.exec(line);
    if (m) {
      const list = rungsByLadder.get(m[7]) ?? [];
      list.push({ code: m[1], name: m[2], position: Number(m[3]) });
      rungsByLadder.set(m[7], list);
      continue;
    }
    m = exerciseRe.exec(line);
    if (m) {
      exercises.push({
        code: m[1],
        name: m[2],
        unit: m[3],
        muscles: JSON.parse(m[4]),
        startSteps: JSON.parse(m[5]),
        ladder: m[8],
      });
      continue;
    }
    m = templateRe.exec(line);
    if (m) {
      templates.push({
        daysCount: Number(m[1]),
        dayKey: m[2],
        label: m[3],
        finisher: m[5],
        codes: JSON.parse(m[6]),
        openingComboKey: m[7] === "NULL" ? null : m[7].slice(1, -1),
      });
    }
  }

  // Escaleras: mismo set de codes y mismo orden de peldanos que LAD.
  const ladderCodes = [...rungsByLadder.keys()].sort();
  const oracleCodes = Object.keys(oracle.LAD).sort();
  if (ladderCodes.join(",") !== oracleCodes.join(",")) {
    diffs.push(
      `escaleras: semilla [${ladderCodes}] vs oraculo [${oracleCodes}]`,
    );
  }
  const nameByRung = new Map(); // "escalera/rungCode" -> name
  for (const [ladder, expected] of Object.entries(oracle.LAD)) {
    const rungs = [...(rungsByLadder.get(ladder) ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    const names = rungs.map((r) => r.name);
    if (names.join("|") !== expected.join("|")) {
      diffs.push(
        `peldanos de ${ladder}: semilla [${names.join("|")}] vs oraculo [${expected.join("|")}]`,
      );
    }
    if (!rungs.every((r, i) => r.position === i)) {
      diffs.push(`posiciones de ${ladder} no son 0..n-1`);
    }
    for (const r of rungs) nameByRung.set(`${ladder}/${r.code}`, r.name);
  }

  // Tabla de arranque: plantillas de 4 dias contra DIAS.
  for (const [dayName, day] of Object.entries(oracle.DIAS)) {
    const tpl = templates.find((t) => t.daysCount === 4 && t.label === dayName);
    if (!tpl) {
      diffs.push(`plantilla de 4 dias "${dayName}" no existe`);
      continue;
    }
    if (tpl.finisher !== day.fin) {
      diffs.push(`finisher de ${dayName}: "${tpl.finisher}" vs "${day.fin}"`);
    }
    if (tpl.openingComboKey !== tpl.dayKey || !oracle.CMB[dayName]) {
      diffs.push(`combo de apertura de ${dayName}`);
    }
    if (tpl.codes.length !== day.ex.length) {
      diffs.push(
        `${dayName}: ${tpl.codes.length} ejercicios vs ${day.ex.length}`,
      );
      continue;
    }
    day.ex.forEach((oex, i) => {
      const ex = exercises.find((e) => e.code === tpl.codes[i]);
      if (!ex) {
        diffs.push(`${dayName}[${i}]: ejercicio ${tpl.codes[i]} no existe`);
        return;
      }
      if (ex.name !== oex.n)
        diffs.push(`${dayName}[${i}] nombre ${ex.name} vs ${oex.n}`);
      if (ex.ladder !== oex.lad)
        diffs.push(`${dayName}[${i}] escalera ${ex.ladder} vs ${oex.lad}`);
      if (ex.unit !== oex.tipo)
        diffs.push(`${dayName}[${i}] unidad ${ex.unit} vs ${oex.tipo}`);
      const got = ["e1", "e2", "e3", "hold"].map((key) => {
        const s = ex.startSteps.find((x) => x.step === key);
        return s
          ? `${nameByRung.get(`${ex.ladder}/${s.rung}`)}:${s.mode}`
          : "?";
      });
      const want = [
        ...oex.st.map(([rung, mode]) => `${rung}:${mode}`),
        `${oex.hold}:hold`,
      ];
      if (got.join("|") !== want.join("|")) {
        diffs.push(
          `${dayName}[${i}] arranque [${got.join("|")}] vs [${want.join("|")}]`,
        );
      }
    });
  }
  return diffs;
}

if (!existsSync(SEED_SQL)) {
  out("SEMILLA PENDIENTE");
} else {
  const diffs = seedDiffs(readFileSync(SEED_SQL, "utf8"));
  if (diffs.length === 0) {
    out("SEMILLA OK");
  } else {
    failed = true;
    out("SEMILLA FALLA:");
    for (const d of diffs) out(`  - ${d}`);
  }
}

// ------------------------------------------------- 3. motor (plan 201-03)

const ESTADO_DEL_ORACULO = {
  "sin datos": "sin_datos",
  rango: "rango",
  techo1: "techo1",
  bajo: "bajo",
  subir: "subir",
};

function motorDiffs() {
  const diffs = [];
  let cases = 0;
  const same = (label, got, want) => {
    cases += 1;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      diffs.push(
        `${label}: motor=${JSON.stringify(got)} esperado=${JSON.stringify(want)}`,
      );
    }
  };

  // Diferencial completo: todas las secuencias de 0 a 4 marcas, por unidad.
  const alphabet = [0, 2, 3, 5, 6, 7, 8, 9, 12];
  let level = [[]];
  const sequences = [[]];
  for (let len = 1; len <= 4; len++) {
    const next = [];
    for (const seq of level) for (const v of alphabet) next.push([...seq, v]);
    sequences.push(...next);
    level = next;
  }
  for (const unit of ["reps", "s"]) {
    for (const seq of sequences) {
      const want = oracle.next(seq, unit);
      same(
        `diferencial ${unit} [${seq}]`,
        nextTarget(seq, unit, DEFAULT_INC[unit]),
        { target: want.obj, estado: ESTADO_DEL_ORACULO[want.est] },
      );
    }
  }

  // Dorados clave (research 9.1).
  const dorados = [
    [[6, 7, 8, 8], "reps", 3, "subir"],
    [[12, 12], "s", 4, "subir"],
    [[8, 7], "reps", 8, "rango"],
    [[2], "reps", 3, "bajo"],
    [[10, 12], "s", 12, "techo1"],
    [[], "reps", 3, "sin_datos"],
  ];
  for (const [values, unit, target, estado] of dorados) {
    same(
      `dorado ${unit} [${values}]`,
      nextTarget(values, unit, DEFAULT_INC[unit]),
      { target, estado },
    );
  }

  // Hoja Simulacion del xlsx: cambio de progresion tras la 5a sesion.
  const reales = [5, 6, 7, 8, 8, 3, 4, 5, 6, 7, 8, 8];
  const day = (i) => `2026-03-${String(i + 1).padStart(2, "0")}`;
  const rows = [];
  let rungId = 1;
  let sinceDate = null;
  const targets = [];
  const estados = [];
  reales.forEach((value, i) => {
    if (i === 5) {
      rungId = 2;
      sinceDate = day(4);
    }
    rows.push({ date: day(i), value, rungId, prevTarget: null });
    const marks = selectReales(rows, sinceDate, rungId).map((r) => r.value);
    const res = nextTarget(marks, "reps", 1);
    targets.push(res.target);
    estados.push(res.estado);
  });
  same("simulacion objetivos", targets, [6, 7, 8, 8, 3, 4, 5, 6, 7, 8, 8, 3]);
  same("simulacion estados", estados, [
    "rango",
    "rango",
    "rango",
    "techo1",
    "subir",
    "rango",
    "rango",
    "rango",
    "rango",
    "rango",
    "techo1",
    "subir",
  ]);

  // Calibracion (3 casos por unidad en los bordes).
  same("calibracion reps 2", calibracion(2, "reps"), "bajar");
  same("calibracion reps 5", calibracion(5, "reps"), "quedarse");
  same("calibracion reps 6", calibracion(6, "reps"), "subir");
  same("calibracion s 3", calibracion(3, "s"), "bajar");
  same("calibracion s 8", calibracion(8, "s"), "quedarse");
  same("calibracion s 9", calibracion(9, "s"), "subir");

  // A1: el dia del cambio.
  const a1 = (date, rung) => [
    { date, value: 3, rungId: rung, prevTarget: null },
  ];
  same(
    "A1 mismo dia, peldano nuevo",
    selectReales(a1("2026-03-05", 2), "2026-03-05", 2).length,
    1,
  );
  same(
    "A1 mismo dia, peldano viejo",
    selectReales(a1("2026-03-05", 1), "2026-03-05", 2).length,
    0,
  );

  // A3: un SUBIR por ejercicio, en orden e1, e2, e3.
  same("A3 e1+e2", pickSubir({ e1: "subir", e2: "subir", e3: "rango" }), "e1");
  same("A3 e2+e3", pickSubir({ e1: "rango", e2: "subir", e3: "subir" }), "e2");
  same(
    "A3 ninguno",
    pickSubir({ e1: "rango", e2: "rango", e3: "rango" }),
    null,
  );

  // A6: caida del E1.
  same("A6 5,6,4,3", caidaE1([5, 6, 4, 3]), true);
  same("A6 5,6,4,5", caidaE1([5, 6, 4, 5]), false);
  same("A6 9,8,7", caidaE1([9, 8, 7]), false);

  // A8: acierto sobre todo el historial.
  same(
    "A8 acierto",
    accuracy([
      { value: 7, prevTarget: 7 },
      { value: 5, prevTarget: 8 },
      { value: 9, prevTarget: 8 },
      { value: 6, prevTarget: null },
    ]),
    { n: 3, hits: 2, pct: 67, delta: -0.7 },
  );

  return { diffs, cases };
}

{
  const { diffs, cases } = motorDiffs();
  if (diffs.length === 0) {
    out(`MOTOR OK (${cases} casos)`);
  } else {
    failed = true;
    out(`MOTOR FALLA (${diffs.length} de ${cases}):`);
    for (const d of diffs.slice(0, 40)) out(`  - ${d}`);
  }
}

if (failed) process.exit(1);
