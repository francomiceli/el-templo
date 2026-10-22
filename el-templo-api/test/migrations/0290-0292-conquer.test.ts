/**
 * Fase 201 Plan 01: migraciones 0290 y 0291 (Conquer v2), contrato de
 * estructura de las 10 tablas `conquer_*`.
 *
 *  - 0290: catalogo (ladders, rungs, exercises, template_days).
 *  - 0291: estado del alumno (members, steps, sessions, session_steps, alerts,
 *    body_checks).
 *  - 0292: semilla del catalogo (plan 201-02), en el segundo `describe` de
 *    este archivo: conteos, paridad con el oraculo `conquer-app.html`,
 *    idempotencia y "solo gimnasio 1".
 *
 * Se consulta INFORMATION_SCHEMA de la base del worker y no `_migrations`: el
 * runner y el provisioning de tests toleran errores de DDL ("Duplicate",
 * "already exists"), asi que una migracion rota puede figurar como aplicada.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { CONQUER_MODES } from "../../src/db/schema/conquer";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { splitSqlStatements } from "../../src/db/run-migrations";
import { loadOracle } from "../conquer/oracle";
import { loadAnnex } from "../conquer/annex";

const CONQUER_TABLES = [
  "conquer_ladders",
  "conquer_rungs",
  "conquer_exercises",
  "conquer_template_days",
  "conquer_members",
  "conquer_steps",
  "conquer_sessions",
  "conquer_session_steps",
  "conquer_alerts",
  "conquer_body_checks",
] as const;

/** Columnas enum: el COLUMN_TYPE tiene que calzar byte a byte con el schema. */
const ENUM_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ["conquer_exercises", "unit", "enum('reps','s')"],
  ["conquer_members", "status", "enum('pedido','activo')"],
  ["conquer_members", "level", "enum('ternero','novillo','toro')"],
  ["conquer_steps", "step", "enum('e1','e2','e3','hold')"],
  ["conquer_steps", "mode", "enum('completa','negativa','hold')"],
  ["conquer_steps", "calibration", "enum('pendiente','resuelta')"],
  ["conquer_session_steps", "step", "enum('e1','e2','e3','hold')"],
  ["conquer_session_steps", "mode", "enum('completa','negativa','hold')"],
  [
    "conquer_alerts",
    "type",
    "enum('molestia','caida','tope_escalera','paso_nivel')",
  ],
  ["conquer_alerts", "status", "enum('abierta','vista','resuelta')"],
  ["conquer_body_checks", "kind", "enum('dia0','periodico')"],
];

interface TenantColumnRow extends RowDataPacket {
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface UniqueIndexRow extends RowDataPacket {
  indexName: string;
  columnName: string;
}

interface ColumnTypeRow extends RowDataPacket {
  columnType: string;
}

describe("Migraciones 0290-0291 — estructura de las tablas conquer_*", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(CONQUER_TABLES)("%s existe", async (table) => {
    const [rows] = (await app.dbPool.query(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [table],
    )) as [CountRow[], unknown];
    expect(Number(rows[0].total)).toBe(1);
  });

  it.each(CONQUER_TABLES)(
    "%s.tenant_id es int NOT NULL DEFAULT 1",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT DATA_TYPE AS dataType,
                IS_NULLABLE AS isNullable,
                COLUMN_DEFAULT AS columnDefault
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = 'tenant_id'`,
        [table],
      )) as [TenantColumnRow[], unknown];
      expect(rows.length, `${table}.tenant_id no existe`).toBe(1);
      expect(rows[0].dataType).toBe("int");
      expect(rows[0].isNullable).toBe("NO");
      expect(Number(rows[0].columnDefault)).toBe(1);
    },
  );

  it.each(CONQUER_TABLES)(
    "%s tiene la FK de tenant_id a tenants",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'tenant_id'
          AND REFERENCED_TABLE_NAME = 'tenants'`,
        [table],
      )) as [CountRow[], unknown];
      expect(Number(rows[0].total)).toBeGreaterThan(0);
    },
  );

  it.each(CONQUER_TABLES)(
    "%s: todo UNIQUE no-PRIMARY arranca con tenant_id (y hay al menos uno)",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT INDEX_NAME AS indexName, COLUMN_NAME AS columnName
           FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND NON_UNIQUE = 0
            AND INDEX_NAME <> 'PRIMARY'
            AND SEQ_IN_INDEX = 1`,
        [table],
      )) as [UniqueIndexRow[], unknown];
      // Sin esta guarda el test pasaria "vacio" si la tabla perdiera sus UNIQUE.
      expect(rows.length, `${table} no tiene UNIQUE`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.columnName, `${table}.${row.indexName}`).toBe("tenant_id");
      }
    },
  );

  it.each(ENUM_COLUMNS)(
    "%s.%s tiene el enum exacto del schema",
    async (table, column, expected) => {
      const [rows] = (await app.dbPool.query(
        `SELECT COLUMN_TYPE AS columnType
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [table, column],
      )) as [ColumnTypeRow[], unknown];
      expect(rows.length, `${table}.${column} no existe`).toBe(1);
      expect(rows[0].columnType).toBe(expected);
    },
  );
});

// ── 0292: semilla del catalogo (plan 201-02) ─────────────────────────

/** El gimnasio de los fixtures (El Templo = tenant 1). */
const CTX = { tenantId: 1 };

const SEED_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0292_conquer_catalog_seed.sql",
);
const ORACLE_PATH = path.resolve(
  __dirname,
  "../conquer/fixtures/conquer-app.html",
);

/** Oraculo de Nacho (`LAD`, `DIAS`): se carga una vez, alimenta los it.each. */
const oracle = loadOracle(ORACLE_PATH);

// 201-25: la 0293 (anexo) manda sobre el oraculo en finishers, escaleras por
// ejercicio y escaleras de hold. Los finishers se leen del anexo de Nacho.
const ANNEX_PATH = path.resolve(
  __dirname,
  "../conquer/fixtures/conquer-catalogo.md",
);
const annex = loadAnnex(ANNEX_PATH);

/** Finisher del anexo §4 para un dia de 4 dias (por bloque). */
function annexFinisher4(block: string): string {
  const day = annex.templates.find(
    (t) => t.daysCount === 4 && t.block === block,
  );
  if (!day) throw new Error(`El anexo no trae el bloque ${block}`);
  return day.finisher;
}

/** Slugs de zona de `BodyFigure` (los 15 que usa el mapa muscular). */
const ZONE_SLUGS = [
  "chest",
  "deltoids",
  "triceps",
  "biceps",
  "forearm",
  "trapezius",
  "upper-back",
  "lower-back",
  "abs",
  "obliques",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "calves",
];

/** Los 12 ejercicios de la sintesis 8.2, en su sort_order (1..12). */
const EXPECTED_EXERCISE_CODES = [
  "planche_hold",
  "planche_press",
  "lsit_plancha",
  "front_hold",
  "front_pullups",
  "front_raises",
  "hspu",
  "press_90",
  "planche_pushup",
  "one_arm_archer",
  "muscle_up",
  "fondo_pelicano",
];

/** Un INSERT IGNORE por fila: 8 + 45 + 12 + 9. */
const SEED_STATEMENTS = 74;

/** Plantillas de 3 y 2 dias (sintesis 2.1): dias, day_key, label, codes, finisher. */
const EXPECTED_SHORT_TEMPLATES: ReadonlyArray<
  readonly [number, string, string, readonly string[], string]
> = [
  [
    3,
    "empuje",
    "Empuje",
    ["planche_hold", "hspu", "planche_pushup"],
    "Fondos o push-ups, 15–20 reps",
  ],
  [
    3,
    "traccion",
    "Tracción",
    ["front_hold", "front_pullups", "muscle_up"],
    // 201-25: la 0293 (anexo §4) manda: el día de tracción lleva el curl.
    "Curl de bíceps en anillas o pelícanos, 15–20 reps",
  ],
  [
    3,
    "mixto",
    "Mixto",
    ["planche_press", "one_arm_archer", "press_90"],
    // 201-25: la 0293 (anexo §4) manda: el mixto lleva las retracciones.
    "Retracciones escapulares + hold en barra",
  ],
  [
    2,
    "empuje",
    "Empuje",
    ["planche_hold", "hspu", "planche_pushup"],
    "Fondos o push-ups, 15–20 reps",
  ],
  [
    2,
    "traccion",
    "Tracción",
    ["front_hold", "one_arm_archer", "muscle_up"],
    // 201-25: la 0293 (anexo §4) manda: la tracción de 2 días lleva el curl.
    "Curl de bíceps en anillas o pelícanos, 15–20 reps",
  ],
];

type LadderRow = typeof schema.conquerLadders.$inferSelect;
type RungRow = typeof schema.conquerRungs.$inferSelect;
type ExerciseRow = typeof schema.conquerExercises.$inferSelect;
type TemplateRow = typeof schema.conquerTemplateDays.$inferSelect;

interface CatalogSnapshot {
  ladders: LadderRow[];
  rungs: RungRow[];
  exercises: ExerciseRow[];
  templates: TemplateRow[];
}

const CATALOG_TABLES = [
  "conquer_ladders",
  "conquer_rungs",
  "conquer_exercises",
  "conquer_template_days",
] as const;

async function loadCatalog(app: FastifyInstance): Promise<CatalogSnapshot> {
  const ladders = await app.db
    .select()
    .from(schema.conquerLadders)
    .where(tenantWhere(schema.conquerLadders, CTX));
  const rungs = await app.db
    .select()
    .from(schema.conquerRungs)
    .where(tenantWhere(schema.conquerRungs, CTX));
  const exercises = await app.db
    .select()
    .from(schema.conquerExercises)
    .where(tenantWhere(schema.conquerExercises, CTX));
  const templates = await app.db
    .select()
    .from(schema.conquerTemplateDays)
    .where(tenantWhere(schema.conquerTemplateDays, CTX));
  return { ladders, rungs, exercises, templates };
}

function countsOf(snap: CatalogSnapshot): number[] {
  return [
    snap.ladders.length,
    snap.rungs.length,
    snap.exercises.length,
    snap.templates.length,
  ];
}

function mustFind<T>(found: T | undefined, what: string): T {
  if (found === undefined) throw new Error(`No existe ${what} en la semilla`);
  return found;
}

/** Peldanos de una escalera de MAS dificil (position 0) a MAS facil. */
function rungsOfLadder(snap: CatalogSnapshot, ladderId: number): RungRow[] {
  return snap.rungs
    .filter((r) => r.ladderId === ladderId)
    .sort((a, b) => a.position - b.position);
}

function ladderByCode(snap: CatalogSnapshot, code: string): LadderRow {
  return mustFind(
    snap.ladders.find((l) => l.code === code),
    `la escalera ${code}`,
  );
}

function exerciseByCode(snap: CatalogSnapshot, code: string): ExerciseRow {
  return mustFind(
    snap.exercises.find((e) => e.code === code),
    `el ejercicio ${code}`,
  );
}

/** Nombre de peldano (el del oraculo) a partir del code que guarda start_steps. */
function rungNameOf(
  snap: CatalogSnapshot,
  ladderId: number,
  rungCode: string,
): string {
  const rung = mustFind(
    snap.rungs.find((r) => r.ladderId === ladderId && r.code === rungCode),
    `el peldaño ${rungCode} de la escalera ${ladderId}`,
  );
  return rung.name;
}

/** `nombre:modo` de cada escalon (e1, e2, e3, hold) de un ejercicio. */
function startStepsAsNames(
  snap: CatalogSnapshot,
  exercise: ExerciseRow,
): string[] {
  // 201-25: la 0293 (anexo) manda: el hold final se resuelve en la escalera de
  // hold del ejercicio (`hold_ladder_id`) o, si es NULL, en la de E1-E3.
  return exercise.startSteps.map((s) => {
    const ladderId =
      s.step === "hold"
        ? (exercise.holdLadderId ?? exercise.ladderId)
        : exercise.ladderId;
    return `${rungNameOf(snap, ladderId, s.rung)}:${s.mode}`;
  });
}

describe("0292 semilla del catálogo", () => {
  let app: FastifyInstance;
  let snap: CatalogSnapshot;

  beforeAll(async () => {
    app = await createTestApp();
    snap = await loadCatalog(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("(1) trae 8 escaleras, 45 peldaños, 12 ejercicios y 9 plantillas", () => {
    // 201-25: la 0293 (anexo) manda: suma 12 escaleras y 61 peldaños. Los
    // conteos de la 0292 se miran sobre SUS 8 escaleras (el total final lo
    // prueba 0293-conquer-anexo.test.ts).
    const seed = snap.ladders.filter((l) => l.code in oracle.LAD);
    const seedIds = new Set(seed.map((l) => l.id));
    expect(seed).toHaveLength(8);
    expect(snap.rungs.filter((r) => seedIds.has(r.ladderId))).toHaveLength(45);
    expect(snap.exercises).toHaveLength(12);
    expect(snap.templates).toHaveLength(9);
  });

  it("(1) las 9 plantillas se reparten en 4, 3 y 2 días", () => {
    const perDays = (n: number) =>
      snap.templates.filter((t) => t.daysCount === n).length;
    expect(perDays(4)).toBe(4);
    expect(perDays(3)).toBe(3);
    expect(perDays(2)).toBe(2);
  });

  it.each(Object.keys(oracle.LAD))(
    "(2) escalera %s: peldaños de más difícil a más fácil = LAD del oráculo",
    (ladderCode) => {
      const ladder = ladderByCode(snap, ladderCode);
      const rungs = rungsOfLadder(snap, ladder.id);
      expect(rungs.map((r) => r.name)).toEqual(oracle.LAD[ladderCode]);
      // position 0 = el más difícil, sin huecos.
      expect(rungs.map((r) => r.position)).toEqual(rungs.map((_, i) => i));
    },
  );

  it.each(Object.keys(oracle.DIAS))(
    "(3) día %s de 4 días: ejercicios, unidad y arranque de Toro = DIAS del oráculo",
    (dayName) => {
      const day = oracle.DIAS[dayName];
      const template = mustFind(
        snap.templates.find(
          (t) => t.daysCount === 4 && t.dayKey === dayName.toLowerCase(),
        ),
        `la plantilla de 4 días ${dayName}`,
      );
      expect(template.label).toBe(dayName);
      // 201-25: la 0293 (anexo §4/§5) manda: el finisher es el del anexo.
      expect(template.finisherText).toBe(annexFinisher4(dayName));
      expect(template.openingComboKey).toBe(dayName.toLowerCase());
      expect(template.exerciseCodes).toHaveLength(day.ex.length);

      const exercises = template.exerciseCodes.map((code) =>
        exerciseByCode(snap, code),
      );
      expect(exercises.map((e) => e.name)).toEqual(day.ex.map((e) => e.n));
      expect(exercises.map((e) => e.unit)).toEqual(day.ex.map((e) => e.tipo));
      for (const [i, oracleEx] of day.ex.entries()) {
        const exercise = exercises[i];
        // 201-25: la 0293 (anexo §2) manda: cada ejercicio tiene su escalera
        // y `palanca`/`lsit` ya no son la del ejercicio. El nombre del peldaño
        // sigue calzando con el oráculo (abajo).
        expect(exercise.startSteps.map((s) => s.step)).toEqual([
          "e1",
          "e2",
          "e3",
          "hold",
        ]);
        expect(startStepsAsNames(snap, exercise)).toEqual([
          ...oracleEx.st.map(([rung, mode]) => `${rung}:${mode}`),
          `${oracleEx.hold}:hold`,
        ]);
      }
    },
  );

  it.each(EXPECTED_SHORT_TEMPLATES)(
    "(4) plantilla de %i días %s: label, ejercicios, finisher y sin combo de apertura",
    (daysCount, dayKey, label, codes, finisher) => {
      const template = mustFind(
        snap.templates.find(
          (t) => t.daysCount === daysCount && t.dayKey === dayKey,
        ),
        `la plantilla de ${daysCount} días ${dayKey}`,
      );
      expect(template.label).toBe(label);
      expect(template.exerciseCodes).toEqual(codes);
      expect(template.finisherText).toBe(finisher);
      expect(template.openingComboKey).toBeNull();
      // Todo code de la plantilla apunta a un ejercicio sembrado.
      for (const code of template.exerciseCodes) {
        expect(exerciseByCode(snap, code).code).toBe(code);
      }
    },
  );

  it("(4) los sort_order de cada cantidad de días son 1..N", () => {
    for (const [daysCount, expected] of [
      [4, [1, 2, 3, 4]],
      [3, [1, 2, 3]],
      [2, [1, 2]],
    ] as const) {
      const orders = snap.templates
        .filter((t) => t.daysCount === daysCount)
        .map((t) => t.sortOrder)
        .sort((a, b) => a - b);
      expect(orders, `plantillas de ${daysCount} días`).toEqual([...expected]);
    }
  });

  it.each(EXPECTED_EXERCISE_CODES)(
    "(5) ejercicio %s: cada escalón de arranque apunta a un peldaño activo de su escalera",
    (code) => {
      const exercise = exerciseByCode(snap, code);
      expect(exercise.sortOrder).toBe(
        EXPECTED_EXERCISE_CODES.indexOf(code) + 1,
      );
      expect(exercise.startSteps).toHaveLength(4);
      for (const step of exercise.startSteps) {
        // 201-25: la 0293 (anexo §2) manda: el hold vive en su escalera de hold.
        const ladderId =
          step.step === "hold"
            ? (exercise.holdLadderId ?? exercise.ladderId)
            : exercise.ladderId;
        const rung = rungsOfLadder(snap, ladderId).find(
          (r) => r.code === step.rung,
        );
        expect(
          rung,
          `${exercise.code}.${step.step}: ${step.rung}`,
        ).toBeDefined();
        expect(rung?.isActive).toBe(true);
        expect(CONQUER_MODES).toContain(step.mode);
      }
      // El hold final siempre es modo hold.
      expect(exercise.startSteps[3]).toMatchObject({
        step: "hold",
        mode: "hold",
      });
    },
  );

  it("(6) las zonas musculares usan slugs de BodyFigure y roles válidos", () => {
    for (const exercise of snap.exercises) {
      expect(exercise.muscles.length, exercise.code).toBeGreaterThan(0);
      expect(
        exercise.muscles.some((m) => m.role === "principal"),
        `${exercise.code} sin zona principal`,
      ).toBe(true);
      for (const muscle of exercise.muscles) {
        expect(ZONE_SLUGS, `${exercise.code}: ${muscle.zone}`).toContain(
          muscle.zone,
        );
        expect(["principal", "secundario"]).toContain(muscle.role);
      }
      // Una zona no puede figurar dos veces en el mismo ejercicio.
      const zones = exercise.muscles.map((m) => m.zone);
      expect(new Set(zones).size, exercise.code).toBe(zones.length);
    }
  });

  it("(7) brazos_rectos: los 11 peldaños de palanca y L-sit, ningún otro", () => {
    const palanca = ladderByCode(snap, "palanca").id;
    const lsit = ladderByCode(snap, "lsit").id;
    // 201-25: la 0293 (anexo) manda: las escaleras nuevas también llevan la
    // marca (igual a su ejercicio). Acá se mira solo lo que sembró la 0292.
    const seedIds = new Set(
      snap.ladders.filter((l) => l.code in oracle.LAD).map((l) => l.id),
    );
    const flagged = snap.rungs.filter(
      (r) => r.brazosRectos && seedIds.has(r.ladderId),
    );
    expect(flagged).toHaveLength(11);
    expect(
      flagged.every((r) => r.ladderId === palanca || r.ladderId === lsit),
    ).toBe(true);
    expect(rungsOfLadder(snap, palanca).every((r) => r.brazosRectos)).toBe(
      true,
    );
    expect(rungsOfLadder(snap, lsit).every((r) => r.brazosRectos)).toBe(true);
  });

  it("(7) unilateral: one arm, OAP asistida y archer de tracción, ningún otro", () => {
    const trac = ladderByCode(snap, "trac").id;
    // 201-25: la 0293 (anexo) manda: la escalera one_arm_archer_hold repite
    // `one arm` como unilateral. Acá se mira solo lo que sembró la 0292.
    const seedIds = new Set(
      snap.ladders.filter((l) => l.code in oracle.LAD).map((l) => l.id),
    );
    const flagged = snap.rungs.filter(
      (r) => r.unilateral && seedIds.has(r.ladderId),
    );
    expect(flagged.map((r) => `${r.ladderId}:${r.code}`).sort()).toEqual(
      [`${trac}:archer`, `${trac}:one_arm`, `${trac}:oap_asistida`].sort(),
    );
  });

  it("(8) el archivo SQL no tiene ';' en comentarios y son 74 statements INSERT IGNORE", () => {
    const sql = readFileSync(SEED_PATH, "utf8");
    const offendingComments = sql
      .split("\n")
      .filter((line) => /^\s*--/.test(line) && line.includes(";"));
    expect(offendingComments).toEqual([]);
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(SEED_STATEMENTS);
    for (const stmt of statements) {
      const body = stmt
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trimStart();
      expect(body.startsWith("INSERT IGNORE INTO conquer_"), body).toBe(true);
    }
  });

  it("(8) re-ejecutar la semilla entera no duplica ni cambia nada", async () => {
    const before = countsOf(snap);
    const idsBefore = snap.rungs.map((r) => r.id).sort((a, b) => a - b);
    const statements = splitSqlStatements(readFileSync(SEED_PATH, "utf8"));
    for (const stmt of statements) {
      await app.dbPool.execute(stmt);
    }
    const after = await loadCatalog(app);
    expect(countsOf(after)).toEqual(before);
    // 201-25: la 0293 (anexo) manda: 8 + 12 escaleras y 45 + 61 peldaños.
    expect(countsOf(after)).toEqual([20, 106, 12, 9]);
    expect(after.rungs.map((r) => r.id).sort((a, b) => a - b)).toEqual(
      idsBefore,
    );
  });

  it.each(CATALOG_TABLES)(
    "(9) %s no tiene filas de ningún gimnasio distinto de 1",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT COUNT(*) AS total FROM ${table} WHERE tenant_id <> ?`,
        [CTX.tenantId],
      )) as [CountRow[], unknown];
      expect(Number(rows[0].total)).toBe(0);
    },
  );
});
