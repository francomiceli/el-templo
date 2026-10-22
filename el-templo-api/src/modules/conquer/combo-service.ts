// Módulo: conquer — combos de Toro (Fase 201 §3, S12-3, D-14)
//
// Combo de apertura (un día del plan) y combos push/pull del sábado. Cada combo
// registra la progresión de arranque (un peldaño de Palanca) y las series
// completadas (§3.3). Reglas de D-14: si completó el objetivo N semanas seguidas
// (N editable) se ofrece Subir en la progresión de arranque, con el mismo patrón
// y el mismo tope que los escalones (§4.5, A2). El app NUNCA recalcula nada:
// pinta lo que manda este servicio.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type {
  ConquerComboState,
  ConquerSessionRow,
} from "../../db/schema/conquer";
import { AppError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { upsertEventAlert } from "./alerts-service";
import {
  addDaysIso,
  blockWeek,
  comboSubirReady,
  mondayOfIso,
} from "./calendar";
import {
  neighborRung,
  type ConquerCatalog,
  type LadderView,
  type RungView,
  type TemplateDayView,
} from "./catalog-service";
import {
  COMBO_LADDER_CODE,
  COMBOS,
  DEFAULT_COMBO_RUNG_CODE,
  isComboKey,
  type ComboKey,
} from "./combos";
import {
  loadMemberContext,
  loadSessionsBetween,
  type MemberContext,
} from "./history-loader";
import { levelHasCombos, openingTarget, saturdayPlan } from "./rules";

type DbInstance = MySql2Database<typeof schema>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

// ── Tipos ───────────────────────────────────────────────────────────

export interface ComboRungOption {
  id: number;
  code: string;
  name: string;
  position: number;
}

export interface ComboSubir {
  ready: boolean;
  /** `ready` con `null` = tope de la escalera: no hay botón, el coach ya está avisado (A2). */
  toRungName: string | null;
}

export interface ComboView {
  comboKey: ComboKey;
  label: string;
  press: string;
  push: string;
  hold: string;
  rungs: ComboRungOption[];
  rungId: number;
  rungName: string;
  target: number;
  value: number;
  /** Solo en el sábado: series máximas y drops que componen el objetivo (§3.2). */
  maxSeries: number | null;
  drops: number | null;
  subir: ComboSubir;
}

/** Lo que el alumno manda por combo: peldaño de arranque y series completadas. */
export interface ComboEntry {
  rungId: number;
  series: number;
}

export interface ComboViewInput {
  comboKey: ComboKey;
  target: number;
  /** Series ya guardadas hoy, o `null` (D-18: el contador precarga el objetivo). */
  saved: number | null;
  maxSeries?: number;
  drops?: number;
}

/** Columnas de combo de `conquer_sessions` (todas, para pisar con NULL al re-guardar). */
export interface ComboColumns {
  comboRungId: number | null;
  comboSeries: number | null;
  comboTarget: number | null;
  pushRungId: number | null;
  pushSeries: number | null;
  pushTarget: number | null;
  pullRungId: number | null;
  pullSeries: number | null;
  pullTarget: number | null;
}

export interface ComboStateWrite {
  comboKey: ComboKey;
  rungId: number;
}

export interface ComboWrites {
  columns: ComboColumns;
  stateWrites: ComboStateWrite[];
}

const NO_COMBO_COLUMNS: ComboColumns = {
  comboRungId: null,
  comboSeries: null,
  comboTarget: null,
  pushRungId: null,
  pushSeries: null,
  pushTarget: null,
  pullRungId: null,
  pullSeries: null,
  pullTarget: null,
};

// ── Errores ─────────────────────────────────────────────────────────

function sinCombosError(): AppError {
  return new AppError("Tu nivel no tiene combos", 409, "CONQUER_SIN_COMBOS");
}

function invalidRungError(): AppError {
  return new AppError(
    "Esa progresión no es de la escalera de los combos o no está disponible",
    400,
    "CONQUER_PELDANO_INVALIDO",
  );
}

function invalidComboError(message: string): AppError {
  return new AppError(message, 400, "CONQUER_COMBO_INVALIDO");
}

function missingLadderError(): AppError {
  return new AppError(
    "Falta configurar la escalera de los combos. Avisale al equipo.",
    409,
    "CONQUER_ESCALON_FALTANTE",
  );
}

// ── Disponibilidad y peldaño actual ─────────────────────────────────

/**
 * §3.2 / §5.1: ¿el combo existe para este alumno? Solo Toro. Los cuatro de
 * apertura salen con la etapa 5 y los del sábado con la etapa 3.
 */
export function comboAvailable(
  level: MemberContext["level"],
  cutStage: number,
  comboKey: ComboKey,
): boolean {
  if (!levelHasCombos(level)) return false;
  if (comboKey === "push" || comboKey === "pull") {
    return saturdayPlan(level, cutStage) !== null;
  }
  return openingTarget(level, 1, cutStage) !== null;
}

function comboLadder(catalog: ConquerCatalog): LadderView {
  const ladder = catalog.ladderByCode.get(COMBO_LADDER_CODE);
  if (!ladder) throw missingLadderError();
  return ladder;
}

function comboLadderRungs(catalog: ConquerCatalog): RungView[] {
  return comboLadder(catalog).rungs.filter((r) => r.isActive);
}

function toOption(rung: RungView): ComboRungOption {
  return {
    id: rung.id,
    code: rung.code,
    name: rung.name,
    position: rung.position,
  };
}

/**
 * §3.3: peldaño de arranque vigente del combo = `combo_state[comboKey]` si sigue
 * activo en Palanca, o `straddle` (default del oráculo).
 */
export function currentComboRung(
  catalog: ConquerCatalog,
  comboState: ConquerComboState | null | undefined,
  comboKey: ComboKey,
): RungView {
  const rungs = comboLadderRungs(catalog);
  const stateId = comboState?.[comboKey]?.rungId;
  const found =
    rungs.find((r) => r.id === stateId) ??
    rungs.find((r) => r.code === DEFAULT_COMBO_RUNG_CODE) ??
    rungs[0];
  if (!found) throw missingLadderError();
  return found;
}

// ── Historial de combos y regla de Subir (D-14) ─────────────────────

interface ComboHistoryRow {
  date: string;
  rungId: number;
  series: number;
  target: number;
}

/** `opening_combo_key` de cada día de la plantilla, por `day_key`. */
function openingKeyByDay(catalog: ConquerCatalog): Map<string, ComboKey> {
  const out = new Map<string, ComboKey>();
  for (const day of catalog.templateDays) {
    if (isComboKey(day.openingComboKey))
      out.set(day.dayKey, day.openingComboKey);
  }
  return out;
}

/** Filas del historial de UN combo (apertura por día del plan o push/pull del sábado). */
function comboHistory(
  catalog: ConquerCatalog,
  sessions: readonly ConquerSessionRow[],
  comboKey: ComboKey,
): ComboHistoryRow[] {
  const openingByDay = openingKeyByDay(catalog);
  const out: ComboHistoryRow[] = [];
  for (const s of sessions) {
    let rungId: number | null = null;
    let series: number | null = null;
    let target: number | null = null;
    if (comboKey === "push") {
      ({ pushRungId: rungId, pushSeries: series, pushTarget: target } = s);
    } else if (comboKey === "pull") {
      ({ pullRungId: rungId, pullSeries: series, pullTarget: target } = s);
    } else if (openingByDay.get(s.dayKey) === comboKey) {
      ({ comboRungId: rungId, comboSeries: series, comboTarget: target } = s);
    }
    if (rungId !== null && series !== null && target !== null) {
      out.push({ date: s.sessionDate, rungId, series, target });
    }
  }
  return out;
}

/**
 * Semanas calendario con alguna sesión del combo: `hit` = alguna con
 * `series >= target` (de la fila). La semana en curso solo cuenta si ya está
 * cumplida: todavía puede completarse y no debe cortar la racha.
 */
function weeklyHits(
  rows: readonly ComboHistoryRow[],
  currentMonday: string,
): { monday: string; hit: boolean }[] {
  const byWeek = new Map<string, boolean>();
  for (const row of rows) {
    const monday = mondayOfIso(row.date);
    byWeek.set(
      monday,
      (byWeek.get(monday) ?? false) || row.series >= row.target,
    );
  }
  return [...byWeek.entries()]
    .filter(([monday, hit]) => hit || monday !== currentMonday)
    .map(([monday, hit]) => ({ monday, hit }));
}

/**
 * D-14: ¿toca Subir en la progresión de arranque del combo? Cuenta las semanas
 * calendario desde `combo_state[comboKey].since` (o la activación) con el mismo
 * peldaño vigente. La racha de `comboWeeksN` semanas tiene que terminar en la
 * semana en curso o en la anterior (una semana que falta corta, como el paso de
 * nivel). `sessions` tiene que cubrir al menos `comboWeeksN` semanas atrás.
 */
export function comboSubirState(
  mctx: MemberContext,
  comboKey: ComboKey,
  sessions: readonly ConquerSessionRow[],
  comboState: ConquerComboState | null | undefined = mctx.member.comboState,
): ComboSubir {
  const rung = currentComboRung(mctx.catalog, comboState, comboKey);
  const since = comboState?.[comboKey]?.since ?? mctx.member.activationDate;
  const rows = comboHistory(mctx.catalog, sessions, comboKey).filter(
    (r) => r.rungId === rung.id && (since === null || r.date >= since),
  );
  const currentMonday = mondayOfIso(mctx.today);
  const weeks = weeklyHits(rows, currentMonday);
  const lastMonday = weeks.reduce(
    (acc, w) => (w.monday > acc ? w.monday : acc),
    "",
  );
  const ready =
    comboSubirReady(weeks, mctx.settings.comboWeeksN) &&
    lastMonday >= addDaysIso(currentMonday, -7);
  if (!ready) return { ready: false, toRungName: null };
  const harder = neighborRung(
    mctx.catalog,
    comboLadder(mctx.catalog).id,
    rung.id,
    "harder",
  );
  return { ready: true, toRungName: harder?.name ?? null };
}

/**
 * Sesiones que alcanzan para la regla de Subir: desde `comboWeeksN` semanas
 * antes de la semana en curso. Una sola query para todos los combos.
 */
export async function loadComboSessions(
  db: DbInstance,
  ctx: TenantContext,
  mctx: MemberContext,
): Promise<ConquerSessionRow[]> {
  const from = addDaysIso(
    mondayOfIso(mctx.today),
    -7 * mctx.settings.comboWeeksN,
  );
  return loadSessionsBetween(db, ctx, mctx.userId, from, mctx.today);
}

// ── Vista ───────────────────────────────────────────────────────────

/**
 * Vista de un combo (§3.3, §13.6). `value` = lo guardado hoy o el objetivo.
 * `comboState` se puede pasar para reconstruir la vista justo después de
 * cambiarlo (la fila de `mctx` quedó vieja).
 */
export function buildComboView(
  mctx: MemberContext,
  input: ComboViewInput,
  sessions: readonly ConquerSessionRow[],
  comboState: ConquerComboState | null | undefined = mctx.member.comboState,
): ComboView {
  const def = COMBOS[input.comboKey];
  const rung = currentComboRung(mctx.catalog, comboState, input.comboKey);
  return {
    comboKey: input.comboKey,
    label: def.label,
    press: def.press,
    push: def.push,
    hold: def.hold,
    rungs: comboLadderRungs(mctx.catalog).map(toOption),
    rungId: rung.id,
    rungName: rung.name,
    target: input.target,
    value: input.saved ?? input.target,
    maxSeries: input.maxSeries ?? null,
    drops: input.drops ?? null,
    subir: comboSubirState(mctx, input.comboKey, sessions, comboState),
  };
}

/** Combos de apertura o sábado que existen para el alumno, para `ProgressResponse.comboSubir`. */
export function availableComboKeys(mctx: MemberContext): ComboKey[] {
  const keys: ComboKey[] = [
    ...new Set(
      mctx.catalog.templateDays
        .filter((d) => d.daysCount === mctx.daysCount)
        .map((d) => d.openingComboKey)
        .filter(isComboKey),
    ),
    "push",
    "pull",
  ];
  return keys.filter((k) =>
    comboAvailable(mctx.level, mctx.member.cutStage, k),
  );
}

export interface ComboSubirItem {
  comboKey: ComboKey;
  label: string;
  fromRungName: string;
  toRungName: string | null;
}

/** Combos listos para Subir (Progreso, D-14). Vacío para Ternero y Novillo. */
export function buildComboSubirItems(
  mctx: MemberContext,
  sessions: readonly ConquerSessionRow[],
): ComboSubirItem[] {
  const items: ComboSubirItem[] = [];
  for (const comboKey of availableComboKeys(mctx)) {
    const state = comboSubirState(mctx, comboKey, sessions);
    if (!state.ready) continue;
    items.push({
      comboKey,
      label: COMBOS[comboKey].label,
      fromRungName: currentComboRung(
        mctx.catalog,
        mctx.member.comboState,
        comboKey,
      ).name,
      toRungName: state.toRungName,
    });
  }
  return items;
}

// ── Guardado (lo usa session-service) ───────────────────────────────

/** §3.3: el peldaño tiene que ser uno activo de Palanca (T-201-34). */
function assertComboRung(catalog: ConquerCatalog, rungId: number): void {
  if (!comboLadderRungs(catalog).some((r) => r.id === rungId)) {
    throw invalidRungError();
  }
}

/** Sábado: push y pull obligatorios, sin apertura (§3.2). */
function saturdayWrites(
  mctx: MemberContext,
  body: { opening?: ComboEntry; push?: ComboEntry; pull?: ComboEntry },
): ComboWrites {
  const plan = saturdayPlan(mctx.level, mctx.member.cutStage);
  if (!plan) {
    throw new AppError(
      "Ese día no es parte de tu plan",
      400,
      "CONQUER_DIA_INVALIDO",
    );
  }
  if (body.opening) throw sinCombosError();
  if (!body.push || !body.pull) {
    throw invalidComboError("El sábado tiene que traer los combos push y pull");
  }
  assertComboRung(mctx.catalog, body.push.rungId);
  assertComboRung(mctx.catalog, body.pull.rungId);
  return {
    columns: {
      ...NO_COMBO_COLUMNS,
      pushRungId: body.push.rungId,
      pushSeries: body.push.series,
      pushTarget: plan.target,
      pullRungId: body.pull.rungId,
      pullSeries: body.pull.series,
      pullTarget: plan.target,
    },
    stateWrites: [
      { comboKey: "push", rungId: body.push.rungId },
      { comboKey: "pull", rungId: body.pull.rungId },
    ],
  };
}

/** Día normal: `push`/`pull` nunca; `opening` solo en Toro, en un día con combo y sin el recorte 5. */
function openingWrites(
  mctx: MemberContext,
  day: TemplateDayView,
  body: { opening?: ComboEntry; push?: ComboEntry; pull?: ComboEntry },
): ComboWrites {
  if (body.push || body.pull) throw sinCombosError();
  if (!body.opening) return { columns: NO_COMBO_COLUMNS, stateWrites: [] };
  const target = openingTarget(
    mctx.level,
    blockWeek(mctx.member.activationDate ?? mctx.today, mctx.today),
    mctx.member.cutStage,
  );
  const comboKey = day.openingComboKey;
  if (target === null || !isComboKey(comboKey)) throw sinCombosError();
  assertComboRung(mctx.catalog, body.opening.rungId);
  return {
    columns: {
      ...NO_COMBO_COLUMNS,
      comboRungId: body.opening.rungId,
      comboSeries: body.opening.series,
      comboTarget: target,
    },
    stateWrites: [{ comboKey, rungId: body.opening.rungId }],
  };
}

/**
 * Valida y arma lo que `saveSession` escribe de los combos (S12-3, T-201-33/34).
 * `day === null` = sábado. Para Ternero y Novillo cualquier combo es 409
 * `CONQUER_SIN_COMBOS`. `opening` es OPCIONAL: sin él no se guardan `combo_*` y
 * esa semana no cuenta para la regla de Subir (la exigencia la pone el app).
 */
export function planComboWrites(
  mctx: MemberContext,
  day: TemplateDayView | null,
  body: { opening?: ComboEntry; push?: ComboEntry; pull?: ComboEntry },
): ComboWrites {
  if (!levelHasCombos(mctx.level)) {
    if (body.opening || body.push || body.pull) throw sinCombosError();
    return { columns: NO_COMBO_COLUMNS, stateWrites: [] };
  }
  return day === null
    ? saturdayWrites(mctx, body)
    : openingWrites(mctx, day, body);
}

/**
 * §4.5: un peldaño de arranque distinto del vigente reinicia el combo
 * (`since = hoy`), igual que cambiar un escalón a mano. Lee la fila con
 * `FOR UPDATE`: dos guardados simultáneos no se pisan el JSON.
 */
export async function applyComboStateWrites(
  tx: Tx,
  ctx: TenantContext,
  memberId: number,
  today: string,
  writes: readonly ComboStateWrite[],
): Promise<void> {
  if (writes.length === 0) return;
  const [row] = await tx
    .select({ comboState: schema.conquerMembers.comboState })
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.id, memberId),
      ),
    )
    .limit(1)
    .for("update");
  const state: ConquerComboState = { ...(row?.comboState ?? {}) };
  let changed = false;
  for (const write of writes) {
    if (state[write.comboKey]?.rungId === write.rungId) continue;
    state[write.comboKey] = { rungId: write.rungId, since: today };
    changed = true;
  }
  if (!changed) return;
  await tx
    .update(schema.conquerMembers)
    .set({ comboState: state })
    .where(
      and(
        tenantWhere(schema.conquerMembers, ctx),
        eq(schema.conquerMembers.id, memberId),
      ),
    );
}

// ── Subir (D-14) ────────────────────────────────────────────────────

function noTocaSubirError(): AppError {
  return new AppError(
    "Ese combo todavía no te toca subir",
    409,
    "CONQUER_NO_TOCA_SUBIR",
  );
}

/** Dedupe de la alerta de tope: `tope:combo:<comboKey>:<rungId>` (una por combo y peldaño). */
export function comboTopeDedupeKey(comboKey: ComboKey, rungId: number): string {
  return `tope:combo:${comboKey}:${rungId}`;
}

/** Objetivo y desglose del combo hoy, para reconstruir su vista tras Subir. */
function viewInputFor(mctx: MemberContext, comboKey: ComboKey): ComboViewInput {
  if (comboKey === "push" || comboKey === "pull") {
    const plan = saturdayPlan(mctx.level, mctx.member.cutStage);
    if (!plan) throw sinCombosError();
    return {
      comboKey,
      target: plan.target,
      saved: null,
      maxSeries: plan.maxSeries,
      drops: plan.drops,
    };
  }
  const target = openingTarget(
    mctx.level,
    blockWeek(mctx.member.activationDate ?? mctx.today, mctx.today),
    mctx.member.cutStage,
  );
  if (target === null) throw sinCombosError();
  return { comboKey, target, saved: null };
}

/**
 * Botón Subir de la progresión de arranque de un combo (D-14, §4.5): sin
 * aprobación del coach. El servidor recalcula la regla (T-201-26). En el tope
 * avisa al coach (alerta 🟡) y responde 409 `CONQUER_TOPE_ESCALERA` (A2).
 */
export async function subirCombo(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  comboKey: ComboKey,
): Promise<{ combo: ComboView }> {
  const mctx = await loadMemberContext(db, ctx, userId);
  if (!comboAvailable(mctx.level, mctx.member.cutStage, comboKey)) {
    throw sinCombosError();
  }
  const sessions = await loadComboSessions(db, ctx, mctx);
  const state = comboSubirState(mctx, comboKey, sessions);
  if (!state.ready) throw noTocaSubirError();

  const current = currentComboRung(
    mctx.catalog,
    mctx.member.comboState,
    comboKey,
  );
  const harder = neighborRung(
    mctx.catalog,
    comboLadder(mctx.catalog).id,
    current.id,
    "harder",
  );
  if (!harder) {
    // Fuera de transacción: el INSERT de la alerta tiene que sobrevivir al 409.
    await upsertEventAlert(db, ctx, {
      userId,
      type: "tope_escalera",
      dedupeKey: comboTopeDedupeKey(comboKey, current.id),
      detail: {
        exerciseName: `Combo ${COMBOS[comboKey].label}`,
        comboKey,
        step: "combo",
        rungName: current.name,
      },
    });
    throw new AppError(
      "Ya estás en la progresión más difícil de este combo. Le avisamos al equipo.",
      409,
      "CONQUER_TOPE_ESCALERA",
    );
  }

  const newState = await db.transaction(async (tx) => {
    // Doble toque: si otro pedido ya movió el combo, este no sube otra vez.
    const [row] = await tx
      .select({ comboState: schema.conquerMembers.comboState })
      .from(schema.conquerMembers)
      .where(
        and(
          tenantWhere(schema.conquerMembers, ctx),
          eq(schema.conquerMembers.id, mctx.member.id),
        ),
      )
      .limit(1)
      .for("update");
    const locked: ConquerComboState = { ...(row?.comboState ?? {}) };
    if (currentComboRung(mctx.catalog, locked, comboKey).id !== current.id) {
      throw noTocaSubirError();
    }
    locked[comboKey] = { rungId: harder.id, since: mctx.today };
    await tx
      .update(schema.conquerMembers)
      .set({ comboState: locked })
      .where(
        and(
          tenantWhere(schema.conquerMembers, ctx),
          eq(schema.conquerMembers.id, mctx.member.id),
        ),
      );
    return locked;
  });

  return {
    combo: buildComboView(
      mctx,
      viewInputFor(mctx, comboKey),
      sessions,
      newState,
    ),
  };
}
