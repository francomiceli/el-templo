/**
 * Fixtures de la regla de Aura de la sesión (fase 214, D-20).
 *
 * La regla mira los bloques de la sesión aprobada y el tiempo propuesto que sale de
 * ellos: una sesión sembrada con `seedApprovedSession` (sin bloques) nunca acredita.
 * Estas funciones siembran bloques y prescripciones reales y calculan el tiempo
 * propuesto con el MISMO código de producción (`getSessionByDayId` más
 * `proposedSecondsForSession`), así los tests no replican la cuenta a mano.
 */
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { SessionGeneratorService } from "../../src/modules/sessions/service";
import { proposedSecondsForSession } from "../../src/modules/sessions/proposed-time";
import { seedApprovedSession } from "../helpers";

const CTX_TEMPLO: TenantContext = { tenantId: 1 };

export interface FixtureBlock {
  role: string;
  formatParams: Record<string, unknown> | null;
  exercises: Array<{ reps: number; seconds: number; rest: number }>;
}

export interface SeededSession {
  sessionId: number;
  /** Tiempo propuesto contando todos los roles sembrados (los ALT se descartan solos). */
  proposedSec: number;
  /** Tiempo propuesto para un `blocksCompleted` puntual (sesiones con Deuteros). */
  proposedSecFor: (blocksCompleted: readonly string[]) => number;
}

/** Sesión estándar sin Deuteros: INITIUM + NUCLEUS, pocos minutos. */
export const STANDARD_BLOCKS: readonly FixtureBlock[] = [
  {
    role: "INITIUM",
    formatParams: { type: "amrap", minutes: 2 },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "NUCLEUS",
    formatParams: { type: "standard" },
    exercises: [
      { reps: 10, seconds: 30, rest: 15 },
      { reps: 10, seconds: 30, rest: 15 },
    ],
  },
];

/** Roles de un arreglo de bloques, en el formato que manda la app en `blocksCompleted`. */
export function rolesOf(blocks: readonly FixtureBlock[]): string[] {
  return blocks.map((b) => b.role);
}

/** Ejercicios de apoyo creados por los fixtures (para borrarlos al final). */
const createdExerciseIds: number[] = [];

/**
 * Siembra una sesión aprobada con bloques y prescripciones. `exercise_id` de las
 * prescripciones apunta a un ejercicio creado acá (nunca un id fijo).
 */
export async function seedSessionWithBlocks(
  app: FastifyInstance,
  dayId: string,
  blocks: readonly FixtureBlock[],
  extras: {
    status?: string;
    sessionMode?: string;
    goalPlanType?: string | null;
  } = {},
): Promise<SeededSession> {
  const sessionId = await seedApprovedSession(app, dayId, extras);

  const [exercise] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "TRACCION",
      category: "TEST",
      exercise: `Ejercicio de prueba ${dayId}`,
      effort: "high",
      route: "tren_superior",
      videoUrl: null,
    })
    .$returningId();
  createdExerciseIds.push(exercise.id);

  for (const [blockIndex, block] of blocks.entries()) {
    const [blockRow] = await app.db
      .insert(schema.sessionBlocks)
      .values(
        tenantValues(CTX_TEMPLO, {
          sessionId,
          blockId: `${dayId}-${block.role}`.slice(0, 100),
          role: block.role,
          route: "tren_superior",
          pattern: "TRACCION",
          intensity: 5,
          repsBudget: 100,
          formatId: 1,
          formatName: String(block.formatParams?.type ?? "standard").slice(
            0,
            50,
          ),
          exerciseCount: block.exercises.length,
          sortOrder: blockIndex,
          formatParams: block.formatParams,
        }),
      )
      .$returningId();

    if (block.exercises.length > 0) {
      await app.db.insert(schema.sessionPrescriptions).values(
        block.exercises.map((e, exerciseIndex) =>
          tenantValues(CTX_TEMPLO, {
            blockId: blockRow.id,
            exerciseId: exercise.id,
            exerciseName: `Ejercicio de prueba ${exerciseIndex + 1}`,
            contraction: "CON",
            reps: e.reps,
            seconds: e.seconds,
            rest: e.rest,
            sortOrder: exerciseIndex,
            exerciseType: "main",
          }),
        ),
      );
    }
  }

  await app.db
    .update(schema.sessions)
    .set({ blockCount: blocks.length })
    .where(
      and(
        tenantWhere(schema.sessions, CTX_TEMPLO),
        eq(schema.sessions.id, sessionId),
      ),
    );

  // Mismo camino que el servidor: la sesión se relee con el servicio de producción.
  const daySession = await new SessionGeneratorService(
    app.db,
  ).getSessionByDayId(dayId, true);
  if (!daySession) {
    throw new Error(`seedSessionWithBlocks: no se pudo releer ${dayId}`);
  }
  const proposedSecFor = (blocksCompleted: readonly string[]): number =>
    proposedSecondsForSession(daySession.blocks, blocksCompleted);

  return {
    sessionId,
    proposedSecFor,
    proposedSec: proposedSecFor(rolesOf(blocks)),
  };
}

/** Borra los ejercicios de apoyo que crearon los fixtures. Llamar en `afterAll`. */
export async function cleanupFixtureExercises(
  app: FastifyInstance,
): Promise<void> {
  if (createdExerciseIds.length === 0) return;
  await app.db
    .delete(schema.exercises)
    .where(inArray(schema.exercises.id, createdExerciseIds));
  createdExerciseIds.length = 0;
}

/** Margen sobre el umbral: la sesión dura `ratio x propuesto` más 2 s (alcanza). */
export function startedAtForRatio(proposedSec: number, ratio: number): string {
  return new Date(
    Date.now() - Math.ceil(proposedSec * ratio) * 1000 - 2000,
  ).toISOString();
}

/** La sesión dura 5 s menos que el umbral (no alcanza). */
export function startedAtBelowRatio(
  proposedSec: number,
  ratio: number,
): string {
  return new Date(
    Date.now() - Math.floor(proposedSec * ratio - 5) * 1000,
  ).toISOString();
}
