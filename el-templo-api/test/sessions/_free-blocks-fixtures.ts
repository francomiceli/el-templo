/**
 * Fábricas de la fase 197 (canasta de bloques libres), reusadas por
 * weekly-zones, free-blocks-list, free-blocks-complete, free-blocks-invariants
 * e iso-03-free-blocks.
 *
 * - `seedExercise`: ejercicio con categoría/secundaria/ruta (insumo de las zonas).
 * - `seedSession`: sesión con bloques y prescripciones. `main` en el orden de
 *   `exerciseIds`; la movilidad con `exercise_type = "mobility"` y
 *   `sort_order = 999`. Idempotente: borra antes la sesión con el mismo `dayId`.
 * - `createPresencialMember`: socio con plan `presencial` y suscripción `active`.
 * - `dayIdFor`: el dayId `W{semana}-{día}-{nivel}` que resuelven /daily y /weekly.
 *
 * Todo insert de tabla gym-owned pasa por `tenantValues(ctx, ...)`; el ctx por
 * defecto es El Templo.
 */
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  dateToDayName,
  dateToWeekNumber,
} from "../../src/modules/shared/week-dates";
import { createTestMember, todayStr } from "../helpers";

export const CTX_TEMPLO: TenantContext = { tenantId: 1 };

type SessionStatus = "approved" | "pending_review";
type SessionMode = "regular" | "rom" | "combos" | "tecnica";
type UserLevel = NonNullable<(typeof schema.users.$inferInsert)["level"]>;

export interface SeedBlock {
  role: string;
  route: string;
  pattern?: string;
  formatName?: string;
  formatParams?: Record<string, unknown>;
  exerciseIds: number[];
  mobilityExerciseId?: number;
  repsPerExercise?: number;
  secondsPerExercise?: number;
}

/** dayId que resuelven /daily y /weekly para una fecha y un nivel. */
export function dayIdFor(date: string, level: string): string {
  return `W${dateToWeekNumber(date)}-${dateToDayName(date)}-${level}`;
}

/** Ejercicio sembrado; sin categoría queda en una que la TV no mapea a zonas. */
export async function seedExercise(
  app: FastifyInstance,
  opts: {
    name: string;
    category?: string;
    categorySecondary?: string | null;
    route?: string;
    ctx?: TenantContext;
  },
): Promise<number> {
  const ctx = opts.ctx ?? CTX_TEMPLO;
  const [row] = await app.db
    .insert(schema.exercises)
    .values(
      tenantValues(ctx, {
        pattern: "TRACCION",
        category: opts.category ?? "COORDINATIVO",
        categorySecondary: opts.categorySecondary ?? null,
        exercise: opts.name,
        effort: "high",
        route: opts.route ?? "AF",
        videoUrl: null,
      }),
    )
    .$returningId();
  return row.id;
}

/** Sesión con bloques y prescripciones; devuelve los ids creados. */
export async function seedSession(
  app: FastifyInstance,
  opts: {
    dayId: string;
    week: number;
    day: string;
    levelGroup: string;
    status?: SessionStatus;
    sessionMode?: SessionMode;
    ctx?: TenantContext;
    blocks: SeedBlock[];
  },
): Promise<{ sessionId: number; blockIds: string[] }> {
  const ctx = opts.ctx ?? CTX_TEMPLO;

  // Idempotente: las filas hijas caen por ON DELETE CASCADE.
  await app.db
    .delete(schema.sessions)
    .where(
      and(
        tenantWhere(schema.sessions, ctx),
        eq(schema.sessions.dayId, opts.dayId),
      ),
    );

  const [session] = await app.db
    .insert(schema.sessions)
    .values(
      tenantValues(ctx, {
        dayId: opts.dayId,
        week: opts.week,
        day: opts.day,
        levelGroup: opts.levelGroup,
        blockCount: opts.blocks.length,
        status: opts.status ?? "approved",
        sessionMode: opts.sessionMode ?? "regular",
      }),
    )
    .$returningId();

  const blockIds: string[] = [];
  for (let i = 0; i < opts.blocks.length; i++) {
    const spec = opts.blocks[i];
    const blockId = `${opts.dayId}-${spec.role}`;
    blockIds.push(blockId);

    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values(
        tenantValues(ctx, {
          sessionId: session.id,
          blockId,
          role: spec.role,
          route: spec.route,
          pattern: spec.pattern ?? "TRACCION",
          intensity: 70,
          repsBudget: 40,
          formatId: 1,
          formatName: spec.formatName ?? "AMRAP",
          formatParams: spec.formatParams ?? { type: "amrap", minutes: 10 },
          exerciseCount: spec.exerciseIds.length,
          sortOrder: i,
        }),
      )
      .$returningId();

    const reps = spec.repsPerExercise ?? 10;
    const seconds = spec.secondsPerExercise ?? 0;
    for (let e = 0; e < spec.exerciseIds.length; e++) {
      await app.db.insert(schema.sessionPrescriptions).values(
        tenantValues(ctx, {
          blockId: block.id,
          exerciseId: spec.exerciseIds[e],
          exerciseName: `Ejercicio ${spec.exerciseIds[e]}`,
          contraction: "CON",
          reps,
          seconds,
          rest: 60,
          sortOrder: e,
          exerciseType: "main",
        }),
      );
    }

    if (spec.mobilityExerciseId !== undefined) {
      await app.db.insert(schema.sessionPrescriptions).values(
        tenantValues(ctx, {
          blockId: block.id,
          exerciseId: spec.mobilityExerciseId,
          exerciseName: `Ejercicio ${spec.mobilityExerciseId}`,
          contraction: "CON",
          reps,
          seconds,
          rest: 0,
          sortOrder: 999,
          exerciseType: "mobility",
        }),
      );
    }
  }

  return { sessionId: session.id, blockIds };
}

/** Socio con plan presencial y suscripción activa, con el nivel pedido. */
export async function createPresencialMember(
  app: FastifyInstance,
  opts: { level?: UserLevel; ctx?: TenantContext; branchId?: number } = {},
): Promise<{ id: number; token: string }> {
  const ctx = opts.ctx ?? CTX_TEMPLO;
  const branchId = opts.branchId ?? 1;
  const member = await createTestMember(
    app,
    ctx.tenantId === CTX_TEMPLO.tenantId
      ? { branchId }
      : { branchId, tenantId: ctx.tenantId },
  );

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(ctx, {
        name: `Plan presencial fase 197 ${member.id}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: "presencial" as const,
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
      }),
    )
    .$returningId();

  await app.db.insert(schema.subscriptions).values(
    tenantValues(ctx, {
      userId: member.id,
      planId: plan.id,
      branchId,
      status: "active" as const,
      startDate: todayStr(),
      pricePaid: 15000,
      priceTypeApplied: "regular" as const,
    }),
  );

  if (opts.level) {
    await app.db
      .update(schema.users)
      .set({ level: opts.level })
      .where(
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, member.id)),
      );
  }

  return { id: member.id, token: member.token };
}
