// Module: aura
//
// Premio de AURA "una vez por dia local" (tope diario). Lo comparten el cierre
// de bloques libres (Fase 197 D-12), el cierre de sesion de Entrenamiento y el
// de plan por objetivos (Tanda 2 / hallazgo #4): sin tope, un cliente podia
// fabricar dayIds y cobrar 10 AURA por cada uno.
//
// El candado es el unique `unique_user_source_ref` de `aura_transactions`
// (userId, sourceType, referenceType, referenceId): con referenceId = YYYYMMDD
// local, el segundo intento del dia tira ER_DUP_ENTRY, se captura y no se
// premia. NO es un error.
import { and, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { isDuplicateKeyError } from "../shared/sql-errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { AuraService } from "./service";
import type { AuraSourceType } from "./types";

type DbInstance = MySql2Database<typeof schema>;

export interface DailyAwardInput {
  userId: number;
  sourceType: AuraSourceType;
  referenceType: string;
  /** Fecha local de la sede del socio, `YYYY-MM-DD`. */
  localDate: string;
  description?: string;
}

/**
 * Acredita la AURA del dia una sola vez por (userId, sourceType, referenceType,
 * dia local). Devuelve `true` si acredito, `false` si ya estaba cobrada o si
 * fallo (nunca lanza: el premio no debe romper el cierre que lo origina).
 */
export async function awardOncePerLocalDay(
  auraService: AuraService,
  log: FastifyBaseLogger,
  input: DailyAwardInput,
): Promise<boolean> {
  try {
    await auraService.award({
      userId: input.userId,
      sourceType: input.sourceType,
      referenceType: input.referenceType,
      referenceId: Number(input.localDate.replace(/-/g, "")),
      description: input.description,
    });
    return true;
  } catch (err: unknown) {
    const { isDuplicate, detail } = isDuplicateKeyError(err);
    const logCtx = {
      userId: input.userId,
      referenceType: input.referenceType,
      localDate: input.localDate,
    };
    if (isDuplicate) {
      log.info(logCtx, "AURA del dia ya cobrada");
    } else {
      log.warn({ ...logCtx, detail }, "No se pudo acreditar la AURA del dia");
    }
    return false;
  }
}

/**
 * Zona horaria IANA de la sede del socio (default: la del tenant). Misma
 * resolucion que usa free-blocks para `member.today`.
 */
export async function resolveBranchTimezone(
  db: DbInstance,
  ctx: TenantContext,
  branchId: number | null,
): Promise<string> {
  if (branchId === null) return DEFAULT_TENANT_TIMEZONE;
  const [branch] = await db
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, branchId)),
    )
    .limit(1);
  return branch?.timezone || DEFAULT_TENANT_TIMEZONE;
}

/** Dia de hoy (`YYYY-MM-DD`) en la zona de la sede del socio, nunca UTC. */
export async function localDateForBranch(
  db: DbInstance,
  ctx: TenantContext,
  branchId: number | null,
): Promise<string> {
  return todayInTz(await resolveBranchTimezone(db, ctx, branchId));
}
