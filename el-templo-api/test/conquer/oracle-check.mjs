// Fase 201 (Conquer v2): chequeo local SIN dependencias ni vitest.
//
// Uso: node --no-warnings test/conquer/oracle-check.mjs
//
// Secciones:
//   1. oraculo: carga conquer-app.html con node:vm (oracle.ts) y verifica un caso conocido.
//   2. semilla (plan 201-02): paridad de 0292_conquer_catalog_seed.sql con LAD y DIAS.
//   3. motor (plan 201-03, ver abajo): paridad de engine.ts con next() del oraculo.
//      Los planes 201-03 y 201-04 suman sus secciones al final, antes del resumen.
//
// Imprime ORACULO OK / SEMILLA OK (o la lista de diferencias) y sale con codigo 1 si algo falla.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadOracle } from "./oracle.ts";

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

// ------------------------------------------------- 3. motor (lo suma 201-03)

if (failed) process.exit(1);
