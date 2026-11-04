/**
 * Servicio del Tablero semanal de gerencia (fase 206-05), facade del módulo.
 *
 * `getBoard` arma la matriz de la semana pedida y de la anterior. Para CADA
 * bloque y semana decide si lee la foto o calcula en vivo:
 *
 * - Bloque principal (cobrado, deuda, activos, "vencen la semana que viene"):
 *   se congela el lunes 00:05 AR (D-08). Bloque tardío (embudo y renovaciones):
 *   el viernes 00:05 AR, con 4 días de margen (D-09, D-10).
 * - La decisión es la PRESENCIA de la foto (`main_closed_at` / `late_closed_at`
 *   no null), nunca el día de la semana. La fecha solo elige la etiqueta, vía
 *   `resolveBlockState` (`week.ts`). Una semana cerrada se lee de la foto aunque
 *   los datos vivos cambien (D-08).
 * - Sin foto: la semana en curso y los bloques provisorios se calculan en vivo;
 *   las semanas viejas sin foto muestran deuda y activos en null (D-11).
 *
 * Alcance por rol (D-02, D-15, D-16, D-27): las columnas salen de
 * `listBranchesForScope` SIN `queryCountry`, a propósito, para que el owner vea
 * todos los países; admin/gestion quedan en su país por la propia helper y
 * admin_sede en su sede, sin Total ni Online. Por la misma razón NO se le pasa
 * `scope.country` a ningún cálculo (escondería Barcelona al owner): las fuentes
 * corren para todo el tenant y acá se filtra por las columnas visibles.
 *
 * Online (D-25): las sedes virtuales activas del país forman una columna
 * informativa que no suma al Total. Leads (D-24): viven en su tabla, se leen
 * siempre de ahí y nunca entran a la foto.
 *
 * Excepciones a "cada número coincide con su pantalla de origen" (D-23):
 * Cobrado por sede (D-14, sede del alumno y no del cobro), Renovaciones por
 * sede (D-29, sede actual del alumno y no de la membresía que vence) y las
 * semanas congeladas (D-08/D-09, pueden diferir de lo que hoy muestran las
 * pantallas en vivo).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { enforcedBranchIds } from "../shared/branch-access";
import { listBranchesForScope } from "../shared/branch-list";
import type { CountryScope } from "../shared/country-scope";
import { currencyForCountry } from "../shared/currency";
import { addDays, todayInTz } from "../shared/date-utils";
import { BadRequestError, NotFoundError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  BoardCalculator,
  type PointInTime,
  type WeekFlows,
} from "./calculator";
import { buildBoardMetrics, type FrozenBlocks } from "./matrix";
import type {
  BoardBlockInfo,
  BoardBlockState,
  BoardBranch,
  BoardFreezeBlock,
  BoardGroup,
  BoardWarning,
  BranchWeekValues,
  LateBlockValues,
  LeadsUpsertInput,
  LeadsUpsertResult,
  MainBlockValues,
  WeeklyBoardResponse,
} from "./types";
import {
  BOARD_TZ,
  currentWeekStart,
  dueClosures,
  isCapturedLate,
  isLeadsEditableWeek,
  isMonday,
  lateFreezeDate,
  resolveBlockState,
  weekRange,
} from "./week";

type SnapshotRow = typeof schema.weeklyBoardSnapshots.$inferSelect;
type BoardTx = Parameters<
  Parameters<MySql2Database<typeof schema>["transaction"]>[0]
>[0];

/** Valores de una semana ya resueltos: por sede, estados y sellos de la foto. */
interface ResolvedWeek {
  values: Map<number, BranchWeekValues>;
  states: { main: BoardBlockState; late: BoardBlockState };
  frozen: FrozenBlocks;
  /** Sello más reciente de la foto de cada bloque, null sin foto. */
  capturedAt: { main: Date | null; late: Date | null };
}

function mainFromRow(row: SnapshotRow): MainBlockValues {
  return {
    cobrado: row.cobrado,
    deudaCobrable: row.deudaCobrable,
    deudaMas10: row.deudaMas10,
    deudaIncobrable: row.deudaIncobrable,
    activos: row.activos,
    vencenSemanaSiguiente: row.vencenSemanaSiguiente,
  };
}

function lateFromRow(row: SnapshotRow): LateBlockValues {
  return {
    reservas: row.reservas ?? 0,
    reservasOcurridas: row.reservasOcurridas ?? 0,
    asistieron: row.asistieron ?? 0,
    compraron: row.compraron ?? 0,
    compraronOcurridas: row.compraronOcurridas ?? 0,
    compraronAsistieron: row.compraronAsistieron ?? 0,
    vencimientos: row.vencimientos ?? 0,
    renovaron: row.renovaron ?? 0,
    noRenueva: row.noRenueva ?? 0,
    volvioTarde: row.volvioTarde ?? 0,
    sinContactar: row.sinContactar ?? 0,
  };
}

function latestStamp(stamps: Array<Date | null>): Date | null {
  let latest: Date | null = null;
  for (const stamp of stamps) {
    if (stamp !== null && (latest === null || stamp > latest)) latest = stamp;
  }
  return latest;
}

/** País de las columnas: AR primero, el resto alfabético (D-16). */
function compareCountries(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "AR") return -1;
  if (b === "AR") return 1;
  return a.localeCompare(b);
}

export class WeeklyBoardService {
  private calculator: BoardCalculator;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    this.calculator = new BoardCalculator(db, log);
  }

  /**
   * Matriz del Tablero para la semana `input.weekStart` (default: la en curso)
   * y su semana anterior. `now` es inyectable para los tests.
   */
  async getBoard(
    ctx: TenantContext,
    scope: CountryScope,
    input: { weekStart?: string },
    now: Date = new Date(),
  ): Promise<WeeklyBoardResponse> {
    const current = currentWeekStart(now);
    const week = input.weekStart ?? current;
    if (!isMonday(week)) {
      throw new BadRequestError(
        "La semana tiene que empezar un lunes (YYYY-MM-DD)",
      );
    }
    if (week > current) {
      throw new BadRequestError("No se puede pedir una semana futura");
    }
    const prev = addDays(week, -7);
    const prevPrev = addDays(week, -14);

    const { groups, boardBranches } = await this.resolveColumns(scope);

    // ─── Fotos y leads: una query cada una ───────────────────────────────────
    const [snapshotRows, leadRows] = await Promise.all([
      this.db
        .select()
        .from(schema.weeklyBoardSnapshots)
        .where(
          and(
            tenantWhere(schema.weeklyBoardSnapshots, ctx),
            inArray(schema.weeklyBoardSnapshots.weekStart, [
              week,
              prev,
              prevPrev,
            ]),
          ),
        ),
      this.db
        .select()
        .from(schema.weeklyBoardLeads)
        .where(
          and(
            tenantWhere(schema.weeklyBoardLeads, ctx),
            inArray(schema.weeklyBoardLeads.weekStart, [week, prev]),
          ),
        ),
    ]);

    const rowsOf = (weekStart: string): SnapshotRow[] =>
      snapshotRows.filter((r) => r.weekStart === weekStart);
    const mainRowsOf = (weekStart: string): SnapshotRow[] =>
      rowsOf(weekStart).filter((r) => r.mainClosedAt !== null);
    const lateRowsOf = (weekStart: string): SnapshotRow[] =>
      rowsOf(weekStart).filter((r) => r.lateClosedAt !== null);

    const leadsOf = (weekStart: string): Map<number, number> =>
      new Map(
        leadRows
          .filter((r) => r.weekStart === weekStart)
          .map((r) => [r.branchId, r.leads] as const),
      );

    // ─── Estado de cada bloque: manda la presencia de la foto ───────────────
    const stateOf = (
      block: BoardFreezeBlock,
      weekStart: string,
    ): BoardBlockState =>
      resolveBlockState({
        block,
        weekStart,
        currentWeekStart: current,
        hasPhoto:
          (block === "main" ? mainRowsOf(weekStart) : lateRowsOf(weekStart))
            .length > 0,
      });

    const states = {
      [week]: { main: stateOf("main", week), late: stateOf("late", week) },
      [prev]: { main: stateOf("main", prev), late: stateOf("late", prev) },
    };

    // ─── Cálculos en vivo, solo de lo que no está congelado ─────────────────
    const needsMainLive = (weekStart: string): boolean =>
      states[weekStart].main !== "congelado";
    const needsLateLive = (weekStart: string): boolean =>
      states[weekStart].late !== "congelado";
    // La foto del momento (deuda + activos) se calcula UNA vez por request y
    // solo si algún bloque principal está en curso o provisorio (D-20, D-21).
    const needsPointInTime = [week, prev].some((w) => {
      const s = states[w].main;
      return s === "en_curso" || s === "provisorio";
    });

    const [flowsW, flowsP, pointInTime, lateW, lateP] = await Promise.all([
      needsMainLive(week)
        ? this.calculator.computeWeekFlows(ctx, week, boardBranches)
        : null,
      needsMainLive(prev)
        ? this.calculator.computeWeekFlows(ctx, prev, boardBranches)
        : null,
      needsPointInTime
        ? this.calculator.computePointInTime(ctx, boardBranches)
        : null,
      needsLateLive(week)
        ? this.calculator.computeLate(ctx, week, boardBranches)
        : null,
      needsLateLive(prev)
        ? this.calculator.computeLate(ctx, prev, boardBranches)
        : null,
    ]);

    const resolveWeek = (
      weekStart: string,
      flows: { values: Map<number, WeekFlows> } | null,
      lateLive: Map<number, LateBlockValues> | null,
    ): ResolvedWeek => {
      const { main: mainState, late: lateState } = states[weekStart];
      const mainRows = mainRowsOf(weekStart);
      const lateRows = lateRowsOf(weekStart);
      const mainFrozen = new Map(
        mainRows.map((r) => [r.branchId, mainFromRow(r)] as const),
      );
      const lateFrozen = new Map(
        lateRows.map((r) => [r.branchId, lateFromRow(r)] as const),
      );
      // sin_foto: deuda y activos no se pueden reconstruir (D-11).
      const pit: { values: Map<number, PointInTime> } | null =
        mainState === "sin_foto" ? null : pointInTime;
      const leads = leadsOf(weekStart);

      const values = new Map<number, BranchWeekValues>();
      for (const branch of boardBranches) {
        // Una sede sin fila en un bloque congelado queda con ese bloque en
        // null (sede dada de alta después del cierre); el Total la ignora.
        const main =
          mainState === "congelado"
            ? (mainFrozen.get(branch.id) ?? null)
            : BoardCalculator.composeMain(
                flows?.values.get(branch.id),
                pit?.values.get(branch.id) ?? null,
              );
        const late =
          lateState === "congelado"
            ? (lateFrozen.get(branch.id) ?? null)
            : (lateLive?.get(branch.id) ?? null);
        values.set(branch.id, {
          // Online (sedes virtuales) no tiene leads (D-25).
          leads: branch.isVirtual ? null : (leads.get(branch.id) ?? null),
          main,
          late,
        });
      }

      return {
        values,
        states: { main: mainState, late: lateState },
        frozen: {
          main: mainState === "congelado",
          late: lateState === "congelado",
        },
        capturedAt: {
          main:
            mainState === "congelado"
              ? latestStamp(mainRows.map((r) => r.mainClosedAt))
              : null,
          late:
            lateState === "congelado"
              ? latestStamp(lateRows.map((r) => r.lateClosedAt))
              : null,
        },
      };
    };

    const currentWeek = resolveWeek(week, flowsW, lateW);
    const previousWeek = resolveWeek(prev, flowsP, lateP);

    // ─── Activos de las fotos para la variación (D-21) ──────────────────────
    const activosOf = (weekStart: string): Map<number, number | null> =>
      new Map(
        mainRowsOf(weekStart).map((r) => [r.branchId, r.activos] as const),
      );

    const metrics = buildBoardMetrics({
      groups,
      current: currentWeek.values,
      previous: previousWeek.values,
      frozen: { current: currentWeek.frozen, previous: previousWeek.frozen },
      activosFoto: {
        previousWeek: activosOf(prev),
        weekBeforePrevious: activosOf(prevPrev),
      },
    });

    // ─── Estado de los bloques ──────────────────────────────────────────────
    const blockInfo = (block: BoardFreezeBlock): BoardBlockInfo => {
      const capturedAt = currentWeek.capturedAt[block];
      const state = currentWeek.states[block];
      const live = state === "en_curso" || state === "provisorio";
      return {
        current: state,
        previous: previousWeek.states[block],
        capturedAt: capturedAt ? capturedAt.toISOString() : null,
        capturedLate: capturedAt
          ? isCapturedLate(block, week, capturedAt)
          : false,
        freezesOn: live
          ? block === "main"
            ? addDays(week, 7)
            : lateFreezeDate(week)
          : null,
      };
    };

    return {
      weekStart: week,
      weekEnd: weekRange(week).dateTo,
      previousWeekStart: prev,
      currentWeekStart: current,
      isCurrentWeek: week === current,
      leadsEditable: isLeadsEditableWeek(week, current),
      groups,
      blocks: { main: blockInfo("main"), late: blockInfo("late") },
      metrics,
      warnings: this.dedupeWarnings([
        ...(flowsW?.warnings ?? []),
        ...(flowsP?.warnings ?? []),
        ...(pointInTime?.warnings ?? []),
      ]),
    };
  }

  /**
   * Cierre automático (D-08, D-09, D-10, D-11, D-25): saca las fotos que ya
   * corresponden y faltan. Una sola regla, "cerrar lo vencido que falte", cubre
   * los dos congelamientos y se recupera sola si una corrida se pierde:
   *
   * - Principal: la semana inmediata anterior, desde el lunes 00:05 AR.
   * - Tardío (embudo + renovaciones): las dos semanas anteriores cuyo viernes de
   *   cierre ya llegó (`dueClosures`). Las semanas más viejas que la anterior
   *   NUNCA reciben foto principal: una deuda o unos activos sacados tarde
   *   mentirían (D-11).
   *
   * Semántica temporal: la foto del lunes 00:05 ya ve el lunes para activos y
   * edad de deuda. La del viernes 00:05 no cubre el 5.º día de "renovó" de un
   * vencimiento del domingo (diferencia aceptada por Franco, D-09).
   *
   * Una fila por sede ACTIVA del tenant, física y virtual, con ceros explícitos.
   * Los pasos de cada (semana, bloque) corren en UNA transacción: INSERT de las
   * filas que faltan y UPDATE de los valores `WHERE <sello> IS NULL`. La
   * idempotencia vive en el SQL: lo ya sellado no se toca y un cambio posterior
   * de datos no altera una foto tomada. Una semana cuenta como cerrada solo si
   * TODAS las sedes activas tienen el sello, así una semana sellada a medias
   * (por lo que sea) se completa en la corrida siguiente. Los sellos usan el
   * `now` inyectado, no `NOW()`. Los cálculos se hacen ANTES de abrir la
   * transacción para que dure poco. Devuelve las semanas cerradas en esta corrida.
   */
  async closeDue(
    ctx: TenantContext,
    now: Date = new Date(),
  ): Promise<{ main: string[]; late: string[] }> {
    const closed: { main: string[]; late: string[] } = { main: [], late: [] };
    const due = dueClosures(todayInTz(BOARD_TZ, now));
    const weeks = [...new Set([...due.main, ...due.late])];
    if (weeks.length === 0) return closed;

    const branchRows = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        country: schema.branches.country,
        isVirtual: schema.branches.isVirtual,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.isActive, true),
        ),
      );
    if (branchRows.length === 0) return closed;
    const branches: BoardBranch[] = branchRows.map((b) => ({
      id: b.id,
      name: b.name,
      country: b.country,
      isVirtual: b.isVirtual,
      currency: currencyForCountry(b.country),
    }));

    const snapshots = await this.db
      .select()
      .from(schema.weeklyBoardSnapshots)
      .where(
        and(
          tenantWhere(schema.weeklyBoardSnapshots, ctx),
          inArray(schema.weeklyBoardSnapshots.weekStart, weeks),
        ),
      );

    const rowsOf = (weekStart: string): SnapshotRow[] =>
      snapshots.filter((r) => r.weekStart === weekStart);
    // Cerrada = TODAS las sedes activas con sello (no "alguna").
    const isSealed = (
      weekStart: string,
      stamp: "mainClosedAt" | "lateClosedAt",
    ): boolean => {
      const sealed = new Set(
        rowsOf(weekStart)
          .filter((r) => r[stamp] !== null)
          .map((r) => r.branchId),
      );
      return branches.every((b) => sealed.has(b.id));
    };
    const missingRows = (weekStart: string): BoardBranch[] => {
      const existing = new Set(rowsOf(weekStart).map((r) => r.branchId));
      return branches.filter((b) => !existing.has(b.id));
    };

    const insertMissing = async (
      tx: BoardTx,
      weekStart: string,
    ): Promise<void> => {
      const missing = missingRows(weekStart);
      if (missing.length === 0) return;
      await tx
        .insert(schema.weeklyBoardSnapshots)
        .values(
          missing.map((b) =>
            tenantValues(ctx, {
              weekStart,
              branchId: b.id,
              currency: b.currency,
            }),
          ),
        )
        // No-op explícito (sin ignorar conflictos en silencio, FA-09): si otra corrida insertó
        // la fila entre la lectura y acá, el UNIQUE no tira y no cambia nada.
        .onDuplicateKeyUpdate({ set: { branchId: sql`branch_id` } });
    };

    for (const weekStart of due.main) {
      if (isSealed(weekStart, "mainClosedAt")) continue;
      const [flows, pit] = await Promise.all([
        this.calculator.computeWeekFlows(ctx, weekStart, branches),
        this.calculator.computePointInTime(ctx, branches),
      ]);
      await this.db.transaction(async (tx) => {
        await insertMissing(tx, weekStart);
        for (const branch of branches) {
          const main = BoardCalculator.composeMain(
            flows.values.get(branch.id),
            pit.values.get(branch.id) ?? null,
          );
          await tx
            .update(schema.weeklyBoardSnapshots)
            .set({ ...main, mainClosedAt: now })
            .where(
              and(
                tenantWhere(schema.weeklyBoardSnapshots, ctx),
                eq(schema.weeklyBoardSnapshots.weekStart, weekStart),
                eq(schema.weeklyBoardSnapshots.branchId, branch.id),
                isNull(schema.weeklyBoardSnapshots.mainClosedAt),
              ),
            );
        }
      });
      closed.main.push(weekStart);
      this.log.info(
        {
          tenantId: ctx.tenantId,
          weekStart,
          block: "main",
          branches: branches.length,
        },
        "Tablero: semana cerrada",
      );
    }

    for (const weekStart of due.late) {
      if (isSealed(weekStart, "lateClosedAt")) continue;
      const late = await this.calculator.computeLate(ctx, weekStart, branches);
      await this.db.transaction(async (tx) => {
        await insertMissing(tx, weekStart);
        for (const branch of branches) {
          const values = late.get(branch.id);
          if (!values) continue;
          await tx
            .update(schema.weeklyBoardSnapshots)
            .set({ ...values, lateClosedAt: now })
            .where(
              and(
                tenantWhere(schema.weeklyBoardSnapshots, ctx),
                eq(schema.weeklyBoardSnapshots.weekStart, weekStart),
                eq(schema.weeklyBoardSnapshots.branchId, branch.id),
                isNull(schema.weeklyBoardSnapshots.lateClosedAt),
              ),
            );
        }
      });
      closed.late.push(weekStart);
      this.log.info(
        {
          tenantId: ctx.tenantId,
          weekStart,
          block: "late",
          branches: branches.length,
        },
        "Tablero: semana cerrada",
      );
    }

    return closed;
  }

  /**
   * Guarda (o borra, con `leads: null`) los leads de una sede física activa en
   * la semana en curso o la anterior (D-04, D-05, D-24). El acceso a la sede lo
   * fuerza `requireBranchAccess` en la ruta (206-06).
   */
  async upsertLeads(
    ctx: TenantContext,
    input: LeadsUpsertInput,
    userId: number,
    now: Date = new Date(),
  ): Promise<LeadsUpsertResult> {
    const { branchId, weekStart, leads } = input;

    if (!isMonday(weekStart)) {
      throw new BadRequestError(
        "La semana tiene que empezar un lunes (YYYY-MM-DD)",
      );
    }
    if (!isLeadsEditableWeek(weekStart, currentWeekStart(now))) {
      throw new BadRequestError(
        "Los leads se cargan solo en la semana en curso y en la anterior",
      );
    }

    if (leads !== null && (!Number.isInteger(leads) || leads < 0)) {
      throw new BadRequestError(
        "Los leads tienen que ser un entero mayor o igual a 0",
      );
    }

    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        isActive: schema.branches.isActive,
        isVirtual: schema.branches.isVirtual,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, branchId),
        ),
      )
      .limit(1);
    if (!branch) throw new NotFoundError("Sede no encontrada");
    if (!branch.isActive || branch.isVirtual) {
      throw new BadRequestError("Los leads se cargan en sedes físicas activas");
    }

    if (leads === null) {
      await this.db
        .delete(schema.weeklyBoardLeads)
        .where(
          and(
            tenantWhere(schema.weeklyBoardLeads, ctx),
            eq(schema.weeklyBoardLeads.branchId, branchId),
            eq(schema.weeklyBoardLeads.weekStart, weekStart),
          ),
        );
    } else {
      await this.db
        .insert(schema.weeklyBoardLeads)
        .values(
          tenantValues(ctx, { branchId, weekStart, leads, updatedBy: userId }),
        )
        .onDuplicateKeyUpdate({ set: { leads, updatedBy: userId } });
    }

    // Se relee la fila: el contador de filas de mysql2 cuenta filas encontradas, no
    // cambiadas, así que no sirve para saber qué quedó guardado.
    const [saved] = await this.db
      .select({ leads: schema.weeklyBoardLeads.leads })
      .from(schema.weeklyBoardLeads)
      .where(
        and(
          tenantWhere(schema.weeklyBoardLeads, ctx),
          eq(schema.weeklyBoardLeads.branchId, branchId),
          eq(schema.weeklyBoardLeads.weekStart, weekStart),
        ),
      )
      .limit(1);

    this.log.info(
      { tenantId: ctx.tenantId, branchId, weekStart, leads, userId },
      "Tablero: leads actualizados",
    );

    return { branchId, weekStart, leads: saved?.leads ?? null };
  }

  /**
   * Columnas visibles para el rol (D-02, D-15, D-16, D-25, D-27): grupos por
   * país con sus sedes físicas, y las sedes virtuales del mismo país como
   * Online. `queryCountry` va `undefined` a propósito: el owner ve todo.
   */
  private async resolveColumns(
    scope: CountryScope,
  ): Promise<{ groups: BoardGroup[]; boardBranches: BoardBranch[] }> {
    const visible = await listBranchesForScope(
      this.db,
      scope,
      undefined,
      "weekly-board",
    );
    const enforced = enforcedBranchIds(scope);

    const physical = visible.filter(
      (b) => !b.isVirtual && (enforced === null || enforced.includes(b.id)),
    );
    // admin_sede ve su sede sola: sin sedes virtuales ni Online (D-02).
    const virtual = enforced === null ? visible.filter((b) => b.isVirtual) : [];

    const countries = [...new Set(physical.map((b) => b.country))].sort(
      compareCountries,
    );

    const groups: BoardGroup[] = [];
    const boardBranches: BoardBranch[] = [];
    for (const country of countries) {
      const currency = currencyForCountry(country);
      const own = physical.filter((b) => b.country === country);
      const online = virtual.filter((b) => b.country === country);
      groups.push({
        country,
        currency,
        branches: own.map((b) => ({ id: b.id, name: b.name })),
        hasTotal: enforced === null,
        online:
          online.length > 0
            ? { branchIds: online.map((b) => b.id), label: "Online" }
            : null,
      });
      for (const b of [...own, ...online]) {
        boardBranches.push({
          id: b.id,
          name: b.name,
          country: b.country,
          isVirtual: b.isVirtual,
          currency,
        });
      }
    }
    return { groups, boardBranches };
  }

  /** Un aviso por (sede, métrica, moneda): la semana pedida y la anterior repiten sedes. */
  private dedupeWarnings(warnings: BoardWarning[]): BoardWarning[] {
    const seen = new Set<string>();
    const out: BoardWarning[] = [];
    for (const w of warnings) {
      const key = `${w.branchId}|${w.metric}|${w.currency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out;
  }
}
