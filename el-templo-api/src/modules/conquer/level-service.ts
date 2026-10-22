// Módulo: conquer — paso de nivel confirmado por el coach (Fase 201 §2.2, A13)
//
// El sistema avisa con la alerta verde `paso_nivel` (4 semanas seguidas con el
// plan completo, `alerts-service.ts`). El coach lo confirma con un toque eligiendo
// los días válidos del nivel nuevo. Las progresiones NO se tocan (A13): los
// escalones existentes quedan como están y solo se crean los que falten.
// Devuelve `void`: la ruta responde con `buildFicha`.
import type { FastifyBaseLogger } from "fastify";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  ensureStepsForPlan,
  lockActiveMember,
  requireActiveMember,
  type ConquerActor,
} from "./activation-service";
import { resolveAlertsByCoach } from "./alerts-service";
import { loadCatalog } from "./catalog-service";
import { isValidLevelDays, nextLevel } from "./rules";
import { getConquerSettings } from "./settings";
import { resolveMemberTimezone } from "./timezone";

type DbInstance = MySql2Database<typeof schema>;

export interface LevelUpBody {
  daysCount: number;
}

/**
 * §2.2 / A13: pasa al nivel siguiente con `daysCount` días. Una transacción con
 * `FOR UPDATE` de la fila del alumno primero:
 *   - Toro no tiene nivel siguiente: 409 `CONQUER_NIVEL_MAXIMO`.
 *   - Días que no son del nivel nuevo: 400 `CONQUER_DIAS_INVALIDOS`.
 *   - `level_since = hoy` (reinicia el reloj del próximo paso de nivel).
 *   - `ensureStepsForPlan` crea solo los escalones que faltan en la plantilla
 *     nueva; los existentes (y su peldaño) no se tocan.
 *   - Las alertas `paso_nivel` pendientes quedan `resuelta` con `resolved_by =
 *     actor` (T-201-38).
 */
export async function confirmLevelUp(
  db: DbInstance,
  ctx: TenantContext,
  actor: ConquerActor,
  userId: number,
  body: LevelUpBody,
  log?: FastifyBaseLogger,
): Promise<void> {
  await requireActiveMember(db, ctx, userId);
  const [catalog, settings, tz] = await Promise.all([
    loadCatalog(db, ctx),
    getConquerSettings(db, ctx),
    resolveMemberTimezone(db, ctx, userId),
  ]);
  // "Hoy" del alumno es el de su sede, nunca UTC (§4.4).
  const today = todayInTz(tz);

  await db.transaction(async (tx) => {
    const member = await lockActiveMember(tx, ctx, userId);
    const to = nextLevel(member.level);
    if (!to) {
      throw new AppError(
        "Ese alumno ya está en el nivel máximo",
        409,
        "CONQUER_NIVEL_MAXIMO",
      );
    }
    if (!isValidLevelDays(to, body.daysCount)) {
      // A14: Ternero 2 o 3, Novillo 3 o 4, Toro 4.
      throw new AppError(
        "Esa cantidad de días no es válida para el nivel nuevo",
        400,
        "CONQUER_DIAS_INVALIDOS",
      );
    }

    await tx
      .update(schema.conquerMembers)
      .set({ level: to, daysCount: body.daysCount, levelSince: today })
      .where(
        and(
          tenantWhere(schema.conquerMembers, ctx),
          eq(schema.conquerMembers.id, member.id),
        ),
      );
    await ensureStepsForPlan(
      tx,
      ctx,
      catalog,
      settings,
      { id: member.id, level: to, daysCount: body.daysCount },
      log,
    );
    await resolveAlertsByCoach(tx, ctx, actor, {
      userId,
      types: ["paso_nivel"],
    });
  });
}
