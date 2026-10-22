// Módulo: conquer — ficha del alumno para owner/admin (Fase 201 §7.2, S12-6)
//
// Una pantalla con todo lo que el coach necesita para actuar por excepción: el
// Progreso del alumno (el mismo que ve él, `buildProgress`), sus alertas (las del
// tablero, `loadBoardRows` + `buildBoardMembers`: no se arman dos veces), la
// propuesta de recorte vigente y si puede pasar de nivel. La corrección de
// progresiones del coach (§7.2) reusa `changeStep`.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  requireActiveMember,
  toAdminMemberView,
  type AdminMemberView,
} from "./activation-service";
import {
  buildBoardMembers,
  loadBoardRows,
  type BoardAlert,
} from "./board-service";
import type { StepKey } from "./engine";
import { buildProgress, type ProgressResponse } from "./progress-service";
import {
  cutProposal,
  LEVEL_DAYS,
  nextLevel,
  type CutProposal,
  type Level,
} from "./rules";
import { changeStep, type ChangeStepBody } from "./step-service";

type DbInstance = MySql2Database<typeof schema>;

export interface FichaResponse {
  member: AdminMemberView & {
    firstName: string;
    lastName: string;
    email: string | null;
    /** Fase 201 §6, A19: el alumno autorizó usar sus fotos (y si es sin cara). */
    publishEnabled: boolean;
    publishNoFace: boolean;
  };
  progress: ProgressResponse;
  /** Guardadas pendientes (con `id`) y derivadas por tiempo (`id` null). */
  alerts: BoardAlert[];
  /** Lo que aceptaría el coach hoy (§5.1, A12). `null` = Toro después de la etapa 5 (anexo §8). */
  cutProposal: CutProposal | null;
  /** `to` null = Toro, sin nivel siguiente; `validDays` = días válidos del nivel nuevo (A14). */
  levelUp: { to: Level | null; validDays: number[] };
}

async function loadEmail(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);
  return row?.email ?? null;
}

/**
 * Ficha del alumno. 404 si no tiene fila de Conquer en este gimnasio, 409
 * `CONQUER_NO_ACTIVO` si todavía es un pedido (T-201-37).
 */
export async function buildFicha(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<FichaResponse> {
  const row = await requireActiveMember(db, ctx, userId);
  const [boardRows, progress, email] = await Promise.all([
    loadBoardRows(db, ctx, [userId]),
    buildProgress(db, ctx, userId),
    loadEmail(db, ctx, userId),
  ]);
  const [board] = await buildBoardMembers(db, ctx, boardRows);
  if (!board) {
    throw new AppError(
      "Ese alumno todavía no tiene Conquer activo",
      409,
      "CONQUER_NO_ACTIVO",
    );
  }

  const to = nextLevel(row.level);
  return {
    member: {
      ...toAdminMemberView(row),
      firstName: board.firstName,
      lastName: board.lastName,
      email,
      publishEnabled: row.publishEnabled,
      publishNoFace: row.publishNoFace,
    },
    progress,
    alerts: board.alerts,
    cutProposal: cutProposal(row.level, row.cutStage),
    levelUp: { to, validDays: to ? [...LEVEL_DAYS[to]] : [] },
  };
}

/**
 * §7.2: el coach corrige la progresión de un escalón del alumno. Mismo efecto
 * que cuando lo cambia el alumno (`changeStep`: since = hoy, el E1 vuelve a
 * calibrar). El `userId` sale del path, ya validado contra el gimnasio.
 */
export async function correctStep(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  exerciseId: number,
  step: StepKey,
  body: ChangeStepBody,
): Promise<void> {
  await requireActiveMember(db, ctx, userId);
  await changeStep(db, ctx, userId, exerciseId, step, body);
}
