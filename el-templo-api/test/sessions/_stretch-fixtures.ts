/**
 * Fábricas de la fase 213 (estiramiento post-clase), reusadas por
 * stretch-today, stretch-aislamiento (plan 05) y el job del push (plan 07).
 *
 * - `CATALOGO_SPEC` / `seedStretchCatalog`: las 20 filas de la lista curada
 *   (migración stretch_catalog_seed). En CI la semilla inserta 0 filas porque
 *   `exercises` está vacía, así que cada test las siembra.
 * - `seedMobilityExercise`: ejercicio con `mobility_related` (la familia de base
 *   que usa la regla cuando el nombre prescrito no está en la lista).
 * - `seedClass` / `seedAttendance`: clase (actividad + horario) y asistencia.
 * - `seedStretchSession`: sesión aprobada con movilidad prescrita; la del bloque
 *   STRETCHING viene como `main` (SPEC P-3) y la del resto como `mobility`.
 * - `createMemberWithArm`: socio presencial cuyo grupo del experimento es el
 *   pedido (sin ids fijos: se crean socios hasta que `stretchArm` coincida).
 * - `arrangeStretchScenario`: escenario completo de la oferta del día (reloj,
 *   zona, modo del día, catálogo, socio, sesión, clase y asistencia), compartido
 *   por stretch-today y stretch-complete.
 * - `localClock`: instante UTC de una hora de pared de la sede, para fijar el reloj.
 *
 * Todo insert de tabla gym-owned pasa por `tenantValues(ctx, ...)`; el ctx por
 * defecto es El Templo.
 */
import { vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import type { StretchArm, StretchFamily } from "../../src/db/schema/stretch";
import {
  buildClassDateTime,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { DAY_NAME_TO_NUMBER } from "../../src/modules/shared/training-constants";
import {
  dateToDayName,
  dateToWeekNumber,
  shiftDate,
  weekDayToDate,
} from "../../src/modules/shared/week-dates";
import { effectiveLevelForDay } from "../../src/modules/sessions/session-view";
import { stretchArm } from "../../src/modules/sessions/stretch-timing";
import {
  CTX_TEMPLO,
  createPresencialMember,
  dayIdFor,
  seedExercise,
} from "./_free-blocks-fixtures";

type Ctx = typeof CTX_TEMPLO;
type UserLevel = NonNullable<(typeof schema.users.$inferInsert)["level"]>;
type SessionMode = "regular" | "rom" | "combos" | "tecnica";

/** Fila de la lista curada (SPEC 4.1). `idSemilla` es el id de prod, solo documental. */
export interface CatalogoSpecFila {
  idSemilla: number;
  nombre: string;
  familia: StretchFamily;
  orden: number;
  lados: 1 | 2;
  ordenBase: number | null;
}

export const CATALOGO_SPEC: readonly CatalogoSpecFila[] = [
  {
    idSemilla: 4180,
    nombre: "QUAD STANDING STRETCH",
    familia: "LS",
    orden: 1,
    lados: 2,
    ordenBase: 3,
  },
  {
    idSemilla: 4182,
    nombre: "SITTED GLUTE STRETCH",
    familia: "LS",
    orden: 2,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 4188,
    nombre: "WARRIOR STRETCH",
    familia: "LS",
    orden: 3,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 4184,
    nombre: "LAYED DOWN GLUTE STRETCH",
    familia: "LS",
    orden: 4,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 4185,
    nombre: "COUCH STRETCH",
    familia: "LS",
    orden: 5,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 3892,
    nombre: "PIKE STANDING",
    familia: "MN",
    orden: 1,
    lados: 1,
    ordenBase: 2,
  },
  {
    idSemilla: 3893,
    nombre: "STR PIKE STANDING",
    familia: "MN",
    orden: 2,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 4181,
    nombre: "LAYED DOWN HAM BENT",
    familia: "MN",
    orden: 3,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 3897,
    nombre: "STANDING WINDMILL",
    familia: "MN",
    orden: 4,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 3105,
    nombre: "CAT COW",
    familia: "FL",
    orden: 1,
    lados: 1,
    ordenBase: 1,
  },
  {
    idSemilla: 3106,
    nombre: "TABLE",
    familia: "FL",
    orden: 2,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 3108,
    nombre: "SHOULDER BRIDGE",
    familia: "FL",
    orden: 3,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 3111,
    nombre: "SEAL REPS",
    familia: "FL",
    orden: 4,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 3109,
    nombre: "TABLE TWIST",
    familia: "FL",
    orden: 5,
    lados: 2,
    ordenBase: null,
  },
  {
    idSemilla: 3284,
    nombre: "STANDING LATERAL STRETCH",
    familia: "TTB",
    orden: 1,
    lados: 2,
    ordenBase: 5,
  },
  {
    idSemilla: 5090,
    nombre: "WALL CHEST STRETCH",
    familia: "TS",
    orden: 1,
    lados: 2,
    ordenBase: 4,
  },
  {
    idSemilla: 4474,
    nombre: "BUTCHER FLOOR STRETCH",
    familia: "TS",
    orden: 2,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 4610,
    nombre: "LAY DOWN ARMS UP",
    familia: "TS",
    orden: 3,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 4872,
    nombre: "COBRA STRETCH",
    familia: "TS",
    orden: 4,
    lados: 1,
    ordenBase: null,
  },
  {
    idSemilla: 4818,
    nombre: "ANGELS AND DEMONS",
    familia: "TS",
    orden: 5,
    lados: 1,
    ordenBase: null,
  },
];

/** Nombres de la lista curada, para chequear que una rutina sale del catálogo. */
export const NOMBRES_CATALOGO: ReadonlySet<string> = new Set(
  CATALOGO_SPEC.map((f) => f.nombre),
);

/** Siembra los ejercicios (nombre exacto) y las 20 filas de `stretch_catalog`. */
export async function seedStretchCatalog(
  app: FastifyInstance,
  ctx: Ctx = CTX_TEMPLO,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const fila of CATALOGO_SPEC) {
    const exerciseId = await seedExercise(app, { name: fila.nombre, ctx });
    await app.db.insert(schema.stretchCatalog).values(
      tenantValues(ctx, {
        exerciseId,
        exerciseName: fila.nombre,
        family: fila.familia,
        sortOrder: fila.orden,
        sides: fila.lados,
        baseOrder: fila.ordenBase,
        isActive: true,
      }),
    );
    ids.set(fila.nombre, exerciseId);
  }
  return ids;
}

/** Ejercicio con `mobility_related` (la familia de base del prescrito). */
export async function seedMobilityExercise(
  app: FastifyInstance,
  opts: { name: string; mobilityRelated: string | null; ctx?: Ctx },
): Promise<number> {
  const ctx = opts.ctx ?? CTX_TEMPLO;
  const [row] = await app.db
    .insert(schema.exercises)
    .values(
      tenantValues(ctx, {
        pattern: "TRACCION",
        category: "COORDINATIVO",
        exercise: opts.name,
        effort: "low",
        route: "",
        videoUrl: null,
        mobilityRelated: opts.mobilityRelated,
      }),
    )
    .$returningId();
  return row.id;
}

/** Actividad + horario. `dayOfWeek` 1=lunes..6=sábado, horas "HH:MM". */
export async function seedClass(
  app: FastifyInstance,
  opts: {
    branchId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    activityName?: string;
    isSpecial?: boolean;
    ctx?: Ctx;
  },
): Promise<{ activityId: number; scheduleId: number }> {
  const ctx = opts.ctx ?? CTX_TEMPLO;
  const [activity] = await app.db
    .insert(schema.activities)
    .values(
      tenantValues(ctx, {
        name: opts.activityName ?? "General",
        isSpecial: opts.isSpecial ?? false,
        isActive: true,
      }),
    )
    .$returningId();
  const [schedule] = await app.db
    .insert(schema.schedules)
    .values(
      tenantValues(ctx, {
        branchId: opts.branchId,
        activityId: activity.id,
        dayOfWeek: opts.dayOfWeek,
        startTime: opts.startTime,
        endTime: opts.endTime,
        isActive: true,
      }),
    )
    .$returningId();
  return { activityId: activity.id, scheduleId: schedule.id };
}

/** Asistencia registrada (check-in). `scheduleId: null` = visita sin horario (Wellhub). */
export async function seedAttendance(
  app: FastifyInstance,
  opts: {
    memberId: number;
    branchId: number;
    scheduleId: number | null;
    sessionDate: string;
    source?: "qr" | "manual" | "wellhub";
    ctx?: Ctx;
  },
): Promise<number> {
  const ctx = opts.ctx ?? CTX_TEMPLO;
  const [row] = await app.db
    .insert(schema.attendance)
    .values(
      tenantValues(ctx, {
        memberId: opts.memberId,
        branchId: opts.branchId,
        scheduleId: opts.scheduleId,
        sessionDate: opts.sessionDate,
        source: opts.source ?? "qr",
      }),
    )
    .$returningId();
  return row.id;
}

export interface StretchSeedItem {
  name: string;
  mobilityRelated: string | null;
}

export interface StretchSeedBlock {
  role: string;
  route: string;
  /** Prescripciones `exercise_type = 'mobility'` del bloque. */
  mobility?: StretchSeedItem[];
  /** Prescripciones `main` de un bloque STRETCHING (la movilidad va como main). */
  stretchingMains?: StretchSeedItem[];
}

function levelGroupOf(level: string): string {
  if (level === "alfa" || level === "delta" || level === "kairos") {
    return "alfa_delta";
  }
  return level;
}

/**
 * Sesión aprobada de `date` para `level`, con la movilidad prescrita de cada
 * bloque. Idempotente: borra antes la sesión con el mismo `dayId` (las hijas
 * caen por ON DELETE CASCADE).
 */
export async function seedStretchSession(
  app: FastifyInstance,
  opts: {
    date: string;
    level: string;
    mode: SessionMode;
    blocks: StretchSeedBlock[];
    ctx?: Ctx;
  },
): Promise<{ sessionId: number; dayId: string }> {
  const ctx = opts.ctx ?? CTX_TEMPLO;
  const dayId = dayIdFor(opts.date, opts.level);

  // Idempotente: las filas hijas caen por ON DELETE CASCADE.
  await app.db
    .delete(schema.sessions)
    .where(
      and(tenantWhere(schema.sessions, ctx), eq(schema.sessions.dayId, dayId)),
    );

  const [session] = await app.db
    .insert(schema.sessions)
    .values(
      tenantValues(ctx, {
        dayId,
        week: dateToWeekNumber(opts.date),
        day: dateToDayName(opts.date),
        levelGroup: levelGroupOf(opts.level),
        blockCount: opts.blocks.length,
        status: "approved",
        sessionMode: opts.mode,
      }),
    )
    .$returningId();

  for (let i = 0; i < opts.blocks.length; i++) {
    const spec = opts.blocks[i];
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values(
        tenantValues(ctx, {
          sessionId: session.id,
          blockId: `${dayId}-${spec.role}-${i}`,
          role: spec.role,
          route: spec.route,
          pattern: "TRACCION",
          intensity: 70,
          repsBudget: 40,
          formatId: 1,
          formatName: "AMRAP",
          formatParams: { type: "amrap", minutes: 10 },
          exerciseCount:
            (spec.mobility?.length ?? 0) + (spec.stretchingMains?.length ?? 0),
          sortOrder: i,
        }),
      )
      .$returningId();

    const filas: { item: StretchSeedItem; type: "main" | "mobility" }[] = [
      ...(spec.stretchingMains ?? []).map((item) => ({
        item,
        type: "main" as const,
      })),
      ...(spec.mobility ?? []).map((item) => ({
        item,
        type: "mobility" as const,
      })),
    ];
    for (let e = 0; e < filas.length; e++) {
      const { item, type } = filas[e];
      const exerciseId = await seedMobilityExercise(app, {
        name: item.name,
        mobilityRelated: item.mobilityRelated,
        ctx,
      });
      await app.db.insert(schema.sessionPrescriptions).values(
        tenantValues(ctx, {
          blockId: block.id,
          exerciseId,
          exerciseName: item.name,
          contraction: "ISO",
          reps: 1,
          seconds: 45,
          rest: 0,
          // Las `mobility` van al final del bloque como en prod (999), con el
          // índice sumado para que el orden sea determinista.
          sortOrder: type === "mobility" ? 900 + e : e,
          exerciseType: type,
        }),
      );
    }
  }

  return { sessionId: session.id, dayId };
}

/**
 * Socio presencial cuyo grupo del experimento es `arm`. Crea socios hasta que
 * `stretchArm(member.id)` coincida (sin ids fijos); falla tras 30 intentos.
 */
export async function createMemberWithArm(
  app: FastifyInstance,
  arm: StretchArm,
  opts: { level?: UserLevel; branchId?: number; ctx?: Ctx } = {},
): Promise<{ id: number; token: string }> {
  for (let intento = 0; intento < 30; intento++) {
    const member = await createPresencialMember(app, opts);
    if (stretchArm(member.id) === arm) return member;
  }
  throw new Error(`No se pudo crear un socio del grupo ${arm} en 30 intentos`);
}

/** Instante UTC de la hora de pared `hhmm` del día `date` en la zona `tz`. */
export function localClock(tz: string, date: string, hhmm: string): Date {
  return buildClassDateTime(date, hhmm, tz);
}

// ─── escenario completo (compartido por stretch-today y stretch-complete) ───

export const AR_TZ = "America/Argentina/Buenos_Aires";
export const LEVEL = "sigma";
export const BRANCH_ID = 1;

export type DiaClase = keyof typeof DOW;
export type ModoDia = "regular" | "rom" | "combos" | "tecnica";

export const DOW = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
} as const;

/** Último `dia` (hoy si lo es) según la sede de Buenos Aires, acotado a la semana 51. */
export function lastWeekday(dia: DiaClase): string {
  const realToday = todayInTz(AR_TZ);
  const dow = new Date(`${realToday}T00:00:00`).getDay();
  const back = (dow + 7 - DOW[dia]) % 7;
  const date = shiftDate(realToday, -back);
  const cap = weekDayToDate(51, dia);
  return cap !== null && date > cap ? cap : date;
}

export const BLOQUES_REGULAR: StretchSeedBlock[] = [
  { role: "INITIUM", route: "OAP" },
  {
    role: "NUCLEUS",
    route: "OAP",
    mobility: [
      { name: "QUAD STANDING STRETCH", mobilityRelated: "LS" },
      { name: "PIKE STANDING", mobilityRelated: "MN" },
    ],
  },
];

export const BLOQUES_TECNICA: StretchSeedBlock[] = [
  { role: "INITIUM", route: "OAP" },
  { role: "NUCLEUS", route: "OAP" },
  {
    role: "STRETCHING",
    route: "OAP",
    stretchingMains: [
      { name: "WARRIOR STRETCH", mobilityRelated: null },
      { name: "COBRA STRETCH", mobilityRelated: null },
    ],
  },
];

export interface ArrangeOpts {
  dia?: DiaClase;
  mode?: ModoDia;
  arm?: StretchArm;
  tz?: string;
  /** Hora de pared de la sede a la que se fija el reloj. */
  clock?: string;
  startTime?: string;
  endTime?: string;
  activityName?: string;
  isSpecial?: boolean;
  /** `false` = sin asistencia registrada. */
  attend?: boolean;
  blocks?: StretchSeedBlock[];
}

export interface Arranged {
  date: string;
  tz: string;
  dia: DiaClase;
  member: { id: number; token: string };
  scheduleId: number;
  attendanceId: number | null;
}

/**
 * Arma el escenario: reloj, zona de la sede, modo del día, catálogo, socio,
 * sesión aprobada, clase y asistencia. El reloj se fija ANTES de crear al socio
 * (el que llama restaura `vi.useRealTimers()` en su `afterEach`).
 */
export async function arrangeStretchScenario(
  app: FastifyInstance,
  opts: ArrangeOpts = {},
): Promise<Arranged> {
  const dia = opts.dia ?? "miercoles";
  const mode = opts.mode ?? "regular";
  const tz = opts.tz ?? AR_TZ;
  const date = lastWeekday(dia);

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(localClock(tz, date, opts.clock ?? "21:05"));

  // La zona de la sede 1 tiene que ser la del caso.
  await app.db
    .update(schema.branches)
    .set({ timezone: tz })
    .where(
      and(
        tenantWhere(schema.branches, CTX_TEMPLO),
        eq(schema.branches.id, BRANCH_ID),
      ),
    );

  // day_modes no se limpia entre archivos: el día tiene que tener el modo del caso.
  await app.db
    .delete(schema.dayModes)
    .where(
      and(
        tenantWhere(schema.dayModes, CTX_TEMPLO),
        eq(schema.dayModes.dayOfWeek, DAY_NAME_TO_NUMBER[dia]),
      ),
    );
  await app.db.insert(schema.dayModes).values(
    tenantValues(CTX_TEMPLO, {
      dayOfWeek: DAY_NAME_TO_NUMBER[dia],
      sessionMode: mode,
    }),
  );

  if (
    (
      await app.db
        .select({ id: schema.stretchCatalog.id })
        .from(schema.stretchCatalog)
        .where(tenantWhere(schema.stretchCatalog, CTX_TEMPLO))
        .limit(1)
    ).length === 0
  ) {
    await seedStretchCatalog(app);
  }

  const member = opts.arm
    ? await createMemberWithArm(app, opts.arm, { level: LEVEL })
    : await createPresencialMember(app, { level: LEVEL });

  // En día ROM el socio lee la variante delta (effectiveLevelForDay).
  const sessionLevel =
    mode === "rom" ? effectiveLevelForDay("sigma", true) : LEVEL;
  await seedStretchSession(app, {
    date,
    level: sessionLevel,
    mode,
    blocks:
      opts.blocks ?? (mode === "tecnica" ? BLOQUES_TECNICA : BLOQUES_REGULAR),
  });

  const { scheduleId } = await seedClass(app, {
    branchId: BRANCH_ID,
    dayOfWeek: DOW[dia],
    startTime: opts.startTime ?? "20:00",
    endTime: opts.endTime ?? "21:00",
    activityName: opts.activityName,
    isSpecial: opts.isSpecial,
  });
  const attendanceId =
    opts.attend === false
      ? null
      : await seedAttendance(app, {
          memberId: member.id,
          branchId: BRANCH_ID,
          scheduleId,
          sessionDate: date,
        });

  return { date, tz, dia, member, scheduleId, attendanceId };
}
