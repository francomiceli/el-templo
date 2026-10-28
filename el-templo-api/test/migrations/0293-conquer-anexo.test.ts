/**
 * Fase 201 plan 201-25: migración 0293 (catálogo del anexo de Nacho).
 *
 *  - (1) estructura: las 4 columnas nuevas de `conquer_exercises` y su FK.
 *  - (2) PARIDAD: la base = el anexo `.md`, con el MISMO `annexDiffs` que usa
 *        `oracle-check.mjs` (sin duplicar la comparación).
 *  - (3) conteos finales del gimnasio 1.
 *  - (4) los casos donde el anexo manda sobre la 0292 / el oráculo.
 *  - (5) idempotencia de los statements de datos.
 *  - (6) remapeo (DA-8) de escalones y marcas que ya existían.
 *  - (7) solo el gimnasio 1.
 *
 * OJO: `test/setup.ts` aplica las migraciones TOLERANDO errores ("Unknown
 * column", "Duplicate"...). Un statement mal escrito de la 0293 NO rompe la
 * suite: se saltea en silencio. Por eso la paridad (2) corre contra la base.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { and, eq } from "drizzle-orm";
import { cleanAllTestData, createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { splitSqlStatements } from "../../src/db/run-migrations";
import { addDaysIso } from "../../src/modules/conquer/calendar";
import {
  annexDiffs,
  loadAnnex,
  type CatalogModel,
  type ModelLadder,
} from "../conquer/annex";
import {
  conquerExerciseIds,
  conquerRungId,
  createActiveConquerMember,
  insertConquerSession,
  memberToday,
  readConquerSteps,
  TEMPLO_CTX,
} from "../conquer/_helpers";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../src/db/migrations/0293_conquer_catalogo_anexo.sql",
);
const ANNEX_PATH = path.resolve(
  __dirname,
  "../conquer/fixtures/conquer-catalogo.md",
);

const CATALOG_TABLES = [
  "conquer_ladders",
  "conquer_rungs",
  "conquer_exercises",
  "conquer_template_days",
] as const;

type LadderRow = typeof schema.conquerLadders.$inferSelect;
type RungRow = typeof schema.conquerRungs.$inferSelect;
type ExerciseRow = typeof schema.conquerExercises.$inferSelect;
type TemplateRow = typeof schema.conquerTemplateDays.$inferSelect;

interface Snapshot {
  ladders: LadderRow[];
  rungs: RungRow[];
  exercises: ExerciseRow[];
  templates: TemplateRow[];
}

interface ColumnRow extends RowDataPacket {
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

async function loadSnapshot(app: FastifyInstance): Promise<Snapshot> {
  const ladders = await app.db
    .select()
    .from(schema.conquerLadders)
    .where(tenantWhere(schema.conquerLadders, TEMPLO_CTX));
  const rungs = await app.db
    .select()
    .from(schema.conquerRungs)
    .where(tenantWhere(schema.conquerRungs, TEMPLO_CTX));
  const exercises = await app.db
    .select()
    .from(schema.conquerExercises)
    .where(tenantWhere(schema.conquerExercises, TEMPLO_CTX));
  const templates = await app.db
    .select()
    .from(schema.conquerTemplateDays)
    .where(tenantWhere(schema.conquerTemplateDays, TEMPLO_CTX));
  return { ladders, rungs, exercises, templates };
}

/** Modelo del catálogo tal como está en la base (lo consume `annexDiffs`). */
function modelOf(snap: Snapshot): CatalogModel {
  const ladderById = new Map(snap.ladders.map((l) => [l.id, l]));
  const codeOf = (id: number): string => ladderById.get(id)?.code ?? `?${id}`;
  const ladders: ModelLadder[] = snap.ladders.map((l) => ({
    code: l.code,
    name: l.name,
    isActive: l.isActive,
    rungs: snap.rungs
      .filter((r) => r.ladderId === l.id)
      .map((r) => ({
        code: r.code,
        name: r.name,
        position: r.position,
        isActive: r.isActive,
        unilateral: r.unilateral,
      })),
  }));
  return {
    ladders,
    exercises: snap.exercises.map((e) => ({
      code: e.code,
      name: e.name,
      unit: e.unit,
      ladderCode: codeOf(e.ladderId),
      holdLadderCode: e.holdLadderId === null ? null : codeOf(e.holdLadderId),
      brazosRectos: e.brazosRectos,
      muscles: e.muscles,
      startSteps: {
        toro: e.startSteps,
        novillo: e.startStepsNovillo ?? [],
        ternero: e.startStepsTernero ?? [],
      },
    })),
    templates: snap.templates.map((t) => ({
      daysCount: t.daysCount,
      sortOrder: t.sortOrder,
      label: t.label,
      exerciseCodes: t.exerciseCodes,
      finisherText: t.finisherText,
    })),
  };
}

/** Snapshot sin `created_at`/`updated_at` (un UPDATE idempotente puede tocarlos). */
function withoutTimestamps(snap: Snapshot) {
  const strip = <T extends { createdAt: Date; updatedAt: Date }>(row: T) => {
    const { createdAt, updatedAt, ...rest } = row;
    void createdAt;
    void updatedAt;
    return rest;
  };
  return {
    ladders: snap.ladders.map(strip),
    rungs: snap.rungs.map(strip),
    exercises: snap.exercises.map(strip),
    templates: snap.templates.map(strip),
  };
}

function mustFind<T>(found: T | undefined, what: string): T {
  if (found === undefined) throw new Error(`No existe ${what} en el catálogo`);
  return found;
}

function ladderOf(snap: Snapshot, code: string): LadderRow {
  return mustFind(
    snap.ladders.find((l) => l.code === code),
    `la escalera ${code}`,
  );
}

function exerciseOf(snap: Snapshot, code: string): ExerciseRow {
  return mustFind(
    snap.exercises.find((e) => e.code === code),
    `el ejercicio ${code}`,
  );
}

function rungsOf(snap: Snapshot, ladderCode: string): RungRow[] {
  const ladder = ladderOf(snap, ladderCode);
  return snap.rungs
    .filter((r) => r.ladderId === ladder.id)
    .sort((a, b) => a.position - b.position);
}

function codeOfLadder(snap: Snapshot, id: number | null): string | null {
  if (id === null) return null;
  return snap.ladders.find((l) => l.id === id)?.code ?? null;
}

/** Statements de datos de la 0293: todo menos los ALTER, sin líneas `--`. */
function dataStatements(): string[] {
  return splitSqlStatements(readFileSync(MIGRATION_PATH, "utf8"))
    .map((stmt) =>
      stmt
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((stmt) => !stmt.startsWith("ALTER"));
}

/** Los 4 UPDATE de remapeo (DA-8): `conquer_steps` y `conquer_session_steps`. */
function remapStatements(): string[] {
  const remaps = dataStatements().filter((stmt) =>
    /^UPDATE conquer_(session_)?steps s /.test(stmt),
  );
  expect(remaps).toHaveLength(4);
  return remaps;
}

// ── (4) Casos donde el anexo manda sobre la 0292 ────────────────────

/** Ejercicio -> escalera de hold propia (anexo §2, columna "Hold final" distinta). */
const HOLD_LADDER_BY_EXERCISE: Record<string, string> = {
  hspu: "hspu_hold",
  press_90: "press_90_hold",
  planche_pushup: "planche_pushup_hold",
  one_arm_archer: "one_arm_archer_hold",
  muscle_up: "muscle_up_hold",
  fondo_pelicano: "fondo_pelicano_hold",
};

const HOLD_LADDER_EXERCISES = Object.keys(HOLD_LADDER_BY_EXERCISE);

const NO_HOLD_LADDER_EXERCISES = [
  "planche_hold",
  "planche_press",
  "lsit_plancha",
  "front_hold",
  "front_pullups",
  "front_raises",
];

const ANNEX_CASES: ReadonlyArray<readonly [string, (snap: Snapshot) => void]> =
  [
    [
      "§2: las 3 escaleras front_* terminan en tuck, sin lean",
      (snap) => {
        for (const code of ["front_hold", "front_pullups", "front_raises"]) {
          const rungs = rungsOf(snap, code);
          expect(
            rungs.map((r) => r.code),
            code,
          ).toEqual([
            "full",
            "half_lay",
            "straddle",
            "super_adv_tuck",
            "adv_tuck",
            "tuck",
          ]);
        }
      },
    ],
    [
      "§2: L-sit a plancha tiene 7 peldaños desde a_full hasta a_lean",
      (snap) => {
        expect(rungsOf(snap, "lsit_plancha").map((r) => r.code)).toEqual([
          "a_full",
          "a_half_lay",
          "a_straddle",
          "a_super_adv_tuck",
          "a_adv_tuck",
          "a_tuck",
          "a_lean",
        ]);
      },
    ],
    [
      "§2: 6 ejercicios tienen escalera de hold propia y es la <ejercicio>_hold",
      (snap) => {
        const hold = snap.exercises
          .filter((e) => e.holdLadderId !== null)
          .map((e) => e.code)
          .sort();
        expect(hold).toEqual([...HOLD_LADDER_EXERCISES].sort());
        for (const [code, holdLadder] of Object.entries(
          HOLD_LADDER_BY_EXERCISE,
        )) {
          const e = exerciseOf(snap, code);
          expect(codeOfLadder(snap, e.holdLadderId), code).toBe(holdLadder);
        }
      },
    ],
    [
      "§2: los otros 6 ejercicios usan la misma escalera para el hold (hold_ladder_id NULL)",
      (snap) => {
        for (const code of NO_HOLD_LADDER_EXERCISES) {
          const e = exerciseOf(snap, code);
          expect(e.holdLadderId, code).toBeNull();
          expect(codeOfLadder(snap, e.ladderId), code).toBe(code);
        }
      },
    ],
    [
      "§1: Pull-ups en front lever NO es de brazos rectos y los otros 5 de palanca y L-sit sí",
      (snap) => {
        expect(exerciseOf(snap, "front_pullups").brazosRectos).toBe(false);
        for (const code of [
          "planche_hold",
          "planche_press",
          "lsit_plancha",
          "front_hold",
          "front_raises",
        ]) {
          expect(exerciseOf(snap, code).brazosRectos, code).toBe(true);
        }
        for (const code of HOLD_LADDER_EXERCISES) {
          expect(exerciseOf(snap, code).brazosRectos, code).toBe(false);
        }
      },
    ],
    [
      "§4: el finisher de tracción de 2 y 3 días es el curl (antes estaba cruzado)",
      (snap) => {
        for (const days of [2, 3]) {
          const t = mustFind(
            snap.templates.find(
              (x) => x.daysCount === days && x.dayKey === "traccion",
            ),
            `tracción de ${days} días`,
          );
          expect(t.finisherText).toBe(
            "Curl de bíceps en anillas o pelícanos, 15–20 reps",
          );
        }
      },
    ],
    [
      "§4: el finisher del mixto de 3 días son las retracciones (antes estaba cruzado)",
      (snap) => {
        const t = mustFind(
          snap.templates.find((x) => x.daysCount === 3 && x.dayKey === "mixto"),
          "el mixto de 3 días",
        );
        expect(t.finisherText).toBe("Retracciones escapulares + hold en barra");
      },
    ],
    [
      "§3: Ternero arranca Pull-ups en front lever en tuck en los 4 escalones",
      (snap) => {
        const steps = exerciseOf(snap, "front_pullups").startStepsTernero ?? [];
        expect(steps).toHaveLength(4);
        expect(steps.map((s) => s.rung)).toEqual([
          "tuck",
          "tuck",
          "tuck",
          "tuck",
        ]);
      },
    ],
    [
      "§3: Novillo arranca el hold de Planche push-up en pseudo (no en flexión)",
      (snap) => {
        const steps =
          exerciseOf(snap, "planche_pushup").startStepsNovillo ?? [];
        expect(steps).toHaveLength(4);
        expect(steps.find((s) => s.step === "hold")).toMatchObject({
          rung: "pseudo",
          mode: "hold",
        });
      },
    ],
    [
      "§6: palanca queda activa, se llama Palanca (combos) y ningún ejercicio la usa",
      (snap) => {
        const palanca = ladderOf(snap, "palanca");
        expect(palanca.isActive).toBe(true);
        expect(palanca.name).toBe("Palanca (combos)");
        for (const e of snap.exercises) {
          expect(e.ladderId, e.code).not.toBe(palanca.id);
          expect(e.holdLadderId, e.code).not.toBe(palanca.id);
        }
      },
    ],
  ];

// ── Tests ───────────────────────────────────────────────────────────

describe("0293 — catálogo del anexo de Nacho", () => {
  let app: FastifyInstance;
  let snap: Snapshot;

  beforeAll(async () => {
    app = await createTestApp();
    snap = await loadSnapshot(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ["hold_ladder_id", "int", "YES", null],
    ["brazos_rectos", "tinyint", "NO", "0"],
    ["start_steps_novillo", "json", "YES", null],
    ["start_steps_ternero", "json", "YES", null],
  ] as const)(
    "(1) conquer_exercises.%s es %s, nullable=%s, default=%s",
    async (column, dataType, nullable, columnDefault) => {
      const [rows] = (await app.dbPool.query(
        `SELECT DATA_TYPE AS dataType,
                IS_NULLABLE AS isNullable,
                COLUMN_DEFAULT AS columnDefault
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'conquer_exercises'
            AND COLUMN_NAME = ?`,
        [column],
      )) as [ColumnRow[], unknown];
      expect(rows.length, `${column} no existe`).toBe(1);
      expect(rows[0].dataType).toBe(dataType);
      expect(rows[0].isNullable).toBe(nullable);
      expect(rows[0].columnDefault).toBe(columnDefault);
    },
  );

  it("(1) hold_ladder_id tiene su FK a conquer_ladders.id", async () => {
    const [rows] = (await app.dbPool.query(
      `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'conquer_exercises'
          AND COLUMN_NAME = 'hold_ladder_id'
          AND REFERENCED_TABLE_NAME = 'conquer_ladders'
          AND REFERENCED_COLUMN_NAME = 'id'`,
    )) as [CountRow[], unknown];
    expect(Number(rows[0].total)).toBe(1);
  });

  it("(2) PARIDAD: el catálogo de la base es igual al anexo de Nacho", () => {
    const diffs = annexDiffs(loadAnnex(ANNEX_PATH), modelOf(snap));
    expect(diffs).toEqual([]);
  });

  it("(3) 20 escaleras (19 activas), 106 peldaños, 12 ejercicios y 9 plantillas", () => {
    expect(snap.ladders).toHaveLength(20);
    expect(snap.ladders.filter((l) => l.isActive)).toHaveLength(19);
    expect(snap.rungs).toHaveLength(106);
    expect(snap.exercises).toHaveLength(12);
    expect(snap.templates).toHaveLength(9);
  });

  it.each(ANNEX_CASES)("(4) %s", (_title, check) => {
    check(snap);
  });

  it("(5) re-ejecutar los statements de datos de la 0293 no cambia nada", async () => {
    const before = withoutTimestamps(await loadSnapshot(app));
    for (const stmt of dataStatements()) {
      await app.dbPool.execute(stmt);
    }
    const after = withoutTimestamps(await loadSnapshot(app));
    expect(after).toEqual(before);
  });

  it.each(CATALOG_TABLES)(
    "(7) %s no tiene filas de ningún gimnasio distinto de 1",
    async (table) => {
      const [rows] = (await app.dbPool.query(
        `SELECT COUNT(*) AS total FROM ${table} WHERE tenant_id <> ?`,
        [TEMPLO_CTX.tenantId],
      )) as [CountRow[], unknown];
      expect(Number(rows[0].total)).toBe(0);
    },
  );

  describe("(6) remapeo de datos existentes (DA-8)", () => {
    afterEach(async () => {
      await cleanAllTestData(app);
    });

    /** Apunta un escalón del alumno a un peldaño, como estaba antes de la 0293. */
    async function pointStep(
      userId: number,
      exerciseCode: string,
      step: "e1" | "e2" | "e3" | "hold",
      rungId: number,
    ): Promise<void> {
      const exerciseId = mustFind(
        (await conquerExerciseIds(app)).get(exerciseCode),
        exerciseCode,
      );
      const [member] = await app.db
        .select({ id: schema.conquerMembers.id })
        .from(schema.conquerMembers)
        .where(
          and(
            tenantWhere(schema.conquerMembers, TEMPLO_CTX),
            eq(schema.conquerMembers.userId, userId),
          ),
        );
      await app.db
        .update(schema.conquerSteps)
        .set({ rungId })
        .where(
          and(
            tenantWhere(schema.conquerSteps, TEMPLO_CTX),
            eq(schema.conquerSteps.memberId, member.id),
            eq(schema.conquerSteps.exerciseId, exerciseId),
            eq(schema.conquerSteps.step, step),
          ),
        );
    }

    async function sessionStepRung(
      sessionId: number,
      exerciseCode: string,
    ): Promise<number> {
      const exerciseId = mustFind(
        (await conquerExerciseIds(app)).get(exerciseCode),
        exerciseCode,
      );
      const [row] = await app.db
        .select({ rungId: schema.conquerSessionSteps.rungId })
        .from(schema.conquerSessionSteps)
        .where(
          and(
            tenantWhere(schema.conquerSessionSteps, TEMPLO_CTX),
            eq(schema.conquerSessionSteps.sessionId, sessionId),
            eq(schema.conquerSessionSteps.exerciseId, exerciseId),
            eq(schema.conquerSessionSteps.step, "e1"),
          ),
        );
      return row.rungId;
    }

    it("pasa al mismo code en la escalera nueva, o al más fácil si no existe, y es idempotente", async () => {
      const { userId } = await createActiveConquerMember(app, {
        level: "toro",
        daysCount: 4,
      });
      const palancaTuck = await conquerRungId(app, "palanca", "tuck");
      const palancaLean = await conquerRungId(app, "palanca", "lean");
      const hspuPike = await conquerRungId(app, "hspu", "pike");
      // Estado de la base ANTES de la 0293: ejercicios en `palanca` y hold de HSPU en `hspu`.
      await pointStep(userId, "planche_press", "e1", palancaTuck);
      await pointStep(userId, "front_pullups", "e3", palancaLean);
      await pointStep(userId, "hspu", "hold", hspuPike);
      const hoy = await memberToday(app, userId);
      const sessionId = await insertConquerSession(app, {
        userId,
        date: addDaysIso(hoy, -7),
        dayKey: "plancha",
        steps: [{ exerciseCode: "planche_press", step: "e1", value: 5 }],
      });
      await app.db
        .update(schema.conquerSessionSteps)
        .set({ rungId: palancaTuck })
        .where(
          and(
            tenantWhere(schema.conquerSessionSteps, TEMPLO_CTX),
            eq(schema.conquerSessionSteps.sessionId, sessionId),
          ),
        );
      const control = (await readConquerSteps(app, userId)).get(
        "lsit_plancha:e1",
      );

      for (const stmt of remapStatements()) await app.dbPool.execute(stmt);

      const after = await readConquerSteps(app, userId);
      // Mismo code, escalera nueva.
      expect(after.get("planche_press:e1")?.rungId).toBe(
        await conquerRungId(app, "planche_press", "tuck"),
      );
      // `lean` no existe en front lever: el peldaño activo más fácil.
      expect(after.get("front_pullups:e3")?.rungId).toBe(
        await conquerRungId(app, "front_pullups", "tuck"),
      );
      // El hold de HSPU pasa a su escalera de hold.
      expect(after.get("hspu:hold")?.rungId).toBe(
        await conquerRungId(app, "hspu_hold", "pike"),
      );
      // La marca del historial sigue al peldaño.
      expect(await sessionStepRung(sessionId, "planche_press")).toBe(
        await conquerRungId(app, "planche_press", "tuck"),
      );
      // Un escalón que ya estaba bien no se toca.
      expect(after.get("lsit_plancha:e1")).toEqual(control);

      // Segunda ejecución: sin cambios.
      for (const stmt of remapStatements()) await app.dbPool.execute(stmt);
      const again = await readConquerSteps(app, userId);
      expect([...again.entries()]).toEqual([...after.entries()]);
      expect(await sessionStepRung(sessionId, "planche_press")).toBe(
        await conquerRungId(app, "planche_press", "tuck"),
      );
    });
  });
});
