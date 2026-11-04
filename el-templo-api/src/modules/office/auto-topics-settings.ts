/**
 * Panel "Avisos automáticos" de Oficina (Fase 205, migración 0321): leer y
 * guardar qué detectores de temas automáticos están apagados, para todo el
 * gimnasio o por sede.
 *
 * Al guardar se vuelve a correr ESE detector en el momento (con los avisos ya
 * actualizados) para que los temas abiertos de lo que se apagó se cierren sin
 * esperar al cron de 30 minutos.
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { TenantContext } from "../shared/tenant";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { loadLeadsBranches } from "../weekly-board/leads-branches";
import {
  getOfficeAutoDetector,
  isOfficeAutoDetectorKey,
  OFFICE_AUTO_DETECTORS,
  type OfficeAutoDetectorKey,
} from "./auto-topics-catalog";
import {
  loadAutoTopicMutes,
  replaceDetectorMutes,
  type AutoTopicMutes,
} from "./auto-topics-mutes";
import {
  loadActiveBranches,
  loadWellhubBranches,
  runOfficeAutoDetectorForTenant,
} from "./auto-topics";
import type { OfficeService } from "./service";

type Db = MySql2Database<typeof schema>;

export interface OfficeAutoDetectorSettings {
  key: OfficeAutoDetectorKey;
  label: string;
  description: string;
  perBranch: boolean;
  disabledAll: boolean;
  disabledBranchIds: number[];
  /** Sedes a las que aplica el aviso (vacío si no se apaga por sede). */
  branches: Array<{ id: number; name: string }>;
}

export interface SaveAutoDetectorInput {
  disabledAll: boolean;
  disabledBranchIds: number[];
}

/** Sedes a las que se le puede apagar cada aviso. */
async function applicableBranches(
  db: Db,
  ctx: TenantContext,
  key: OfficeAutoDetectorKey,
): Promise<Array<{ id: number; name: string }>> {
  switch (key) {
    case "wellhub_error":
      return [];
    case "wellhub_sin_publicar":
      return loadWellhubBranches(db, ctx);
    case "tablero_leads":
      return loadLeadsBranches(db, ctx);
    case "jornada_abierta":
    case "clase_sin_profe":
    case "arqueo_diferencia":
      return loadActiveBranches(db, ctx);
  }
}

async function buildSettings(
  db: Db,
  ctx: TenantContext,
  key: OfficeAutoDetectorKey,
  mutes: AutoTopicMutes,
): Promise<OfficeAutoDetectorSettings> {
  const info = getOfficeAutoDetector(key);
  const branches = info.perBranch
    ? (await applicableBranches(db, ctx, key)).map((b) => ({
        id: b.id,
        name: b.name,
      }))
    : [];
  return {
    key,
    label: info.label,
    description: info.description,
    perBranch: info.perBranch,
    disabledAll: mutes.isMutedForAll(key),
    disabledBranchIds: mutes.mutedBranchIds(key),
    branches,
  };
}

export async function getAutoTopicSettings(
  db: Db,
  ctx: TenantContext,
): Promise<OfficeAutoDetectorSettings[]> {
  const mutes = await loadAutoTopicMutes(db, ctx);
  const out: OfficeAutoDetectorSettings[] = [];
  for (const info of OFFICE_AUTO_DETECTORS) {
    out.push(await buildSettings(db, ctx, info.key, mutes));
  }
  return out;
}

function parseDetector(detector: string): OfficeAutoDetectorKey {
  if (!isOfficeAutoDetectorKey(detector)) {
    throw new NotFoundError("Aviso automático no encontrado");
  }
  return detector;
}

/**
 * Reemplaza los avisos silenciados de un detector, corre el detector en el
 * momento y devuelve su estado actualizado. Si la corrida inmediata falla, lo
 * guardado queda (el cron de 30 minutos cierra lo que falte) y se loguea.
 */
export async function saveAutoTopicSettings(
  db: Db,
  service: OfficeService,
  ctx: TenantContext,
  actorId: number,
  detectorParam: string,
  input: SaveAutoDetectorInput,
  now: Date,
  log: FastifyBaseLogger,
): Promise<OfficeAutoDetectorSettings> {
  const key = parseDetector(detectorParam);
  const info = getOfficeAutoDetector(key);
  const disabledBranchIds = [...new Set(input.disabledBranchIds)];

  if (!info.perBranch && disabledBranchIds.length > 0) {
    throw new BadRequestError(
      "Este aviso solo se puede apagar para todo el gimnasio",
    );
  }
  if (disabledBranchIds.length > 0) {
    const allowed = new Set(
      (await applicableBranches(db, ctx, key)).map((b) => b.id),
    );
    if (!disabledBranchIds.every((id) => allowed.has(id))) {
      throw new BadRequestError("Hay sedes que no corresponden a este aviso");
    }
  }

  await replaceDetectorMutes(db, ctx, actorId, key, {
    disabledAll: input.disabledAll,
    disabledBranchIds,
  });

  try {
    await runOfficeAutoDetectorForTenant(db, service, ctx, now, key);
  } catch (err: unknown) {
    log.error(
      { err, tenantId: ctx.tenantId, signal: key },
      "office auto-topics: falló la corrida inmediata tras guardar los avisos",
    );
  }

  const mutes = await loadAutoTopicMutes(db, ctx);
  return buildSettings(db, ctx, key, mutes);
}
