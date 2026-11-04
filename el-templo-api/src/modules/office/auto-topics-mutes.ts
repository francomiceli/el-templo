/**
 * Avisos automáticos silenciados de Oficina (Fase 205, migración 0321).
 *
 * `office_auto_topic_mutes`: una fila por (detector, sede). `branch_id = 0` es
 * "todo el gimnasio". Fila presente = silenciado, ausencia = activo. El runner
 * carga las filas del gimnasio UNA vez por corrida y las consulta con
 * `isMuted(detector, branchId)`.
 */
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { isOfficeAutoDetectorKey } from "./auto-topics-catalog";
import type { OfficeAutoDetectorKey } from "./auto-topics-catalog";

type Db = MySql2Database<typeof schema>;

/** `branch_id` que significa "todo el gimnasio". */
export const MUTE_ALL_BRANCH_ID = 0;

export class AutoTopicMutes {
  private readonly all = new Set<OfficeAutoDetectorKey>();
  private readonly byBranch = new Map<OfficeAutoDetectorKey, Set<number>>();

  constructor(
    rows: ReadonlyArray<{ detector: string; branchId: number }> = [],
  ) {
    for (const row of rows) {
      // Una clave que ya no existe en el catálogo no silencia nada.
      if (!isOfficeAutoDetectorKey(row.detector)) continue;
      if (row.branchId === MUTE_ALL_BRANCH_ID) {
        this.all.add(row.detector);
        continue;
      }
      const set = this.byBranch.get(row.detector) ?? new Set<number>();
      set.add(row.branchId);
      this.byBranch.set(row.detector, set);
    }
  }

  /**
   * `true` si el detector está apagado para todo el gimnasio o para esa sede.
   * `branchId = null` (tema sin sede) solo lo alcanza el apagado general.
   */
  isMuted(detector: OfficeAutoDetectorKey, branchId: number | null): boolean {
    if (this.all.has(detector)) return true;
    return (
      branchId !== null && this.byBranch.get(detector)?.has(branchId) === true
    );
  }

  isMutedForAll(detector: OfficeAutoDetectorKey): boolean {
    return this.all.has(detector);
  }

  mutedBranchIds(detector: OfficeAutoDetectorKey): number[] {
    return [...(this.byBranch.get(detector) ?? [])].sort((a, b) => a - b);
  }
}

/** Sin avisos silenciados: el comportamiento de siempre. */
export const NO_AUTO_TOPIC_MUTES = new AutoTopicMutes();

export async function loadAutoTopicMutes(
  db: Db,
  ctx: TenantContext,
): Promise<AutoTopicMutes> {
  const rows = await db
    .select({
      detector: schema.officeAutoTopicMutes.detector,
      branchId: schema.officeAutoTopicMutes.branchId,
    })
    .from(schema.officeAutoTopicMutes)
    .where(and(tenantWhere(schema.officeAutoTopicMutes, ctx)));
  return new AutoTopicMutes(rows);
}

/** Reemplaza (en una transacción) las filas de UN detector del gimnasio. */
export async function replaceDetectorMutes(
  db: Db,
  ctx: TenantContext,
  actorId: number,
  detector: OfficeAutoDetectorKey,
  input: { disabledAll: boolean; disabledBranchIds: number[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.officeAutoTopicMutes)
      .where(
        and(
          tenantWhere(schema.officeAutoTopicMutes, ctx),
          eq(schema.officeAutoTopicMutes.detector, detector),
        ),
      );
    const branchIds = [
      ...(input.disabledAll ? [MUTE_ALL_BRANCH_ID] : []),
      ...new Set(input.disabledBranchIds),
    ];
    if (branchIds.length === 0) return;
    await tx
      .insert(schema.officeAutoTopicMutes)
      .values(
        branchIds.map((branchId) =>
          tenantValues(ctx, { detector, branchId, createdBy: actorId }),
        ),
      );
  });
}
