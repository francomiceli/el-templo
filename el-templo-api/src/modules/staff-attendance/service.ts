/**
 * Staff Attendance Service (2026-09-07)
 *
 * Check-in / check-out de la jornada laboral del staff. Reusa el MISMO QR
 * físico de sede que los socios escanean para su propio check-in
 * (`shared/qr-token.ts` — el token no distingue "quién" lo escanea, solo
 * lleva `branchId`), tanto para abrir como para cerrar la jornada.
 *
 * Orden de validación (FIJO por el contrato del módulo, ver el prompt de
 * fase): QR inválido (400) → sede inexistente/ajena (404, `NotFoundError`
 * vía `resolveBranchDelGimnasio`) → sede sin acceso (403,
 * `BranchOutOfScopeError`) → conflicto de jornada (409) → validaciones de
 * negocio específicas (400).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, isNull, desc, gte, lte, max, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { validateQrToken } from "../shared/qr-token";
import { resolveBranchDelGimnasio } from "../shared/branch-consistency";
import { canAccessBranch, BRANCH_OUT_OF_SCOPE } from "../shared/branch-access";
import type { CountryScope } from "../shared/country-scope";
import {
  listBranchesForScope,
  type BranchListItem,
} from "../shared/branch-list";
import { todayInTz } from "../shared/date-utils";
import { auditLog } from "../shared/audit-log";
import {
  checklistForDow,
  requiredKeysForDow,
  offeredKeysForDow,
  checklistIncompletoMessage,
} from "./checklist";
import { dowInTz } from "../shared/date-utils";

/** Zona por defecto cuando no hay sede (sin jornada abierta) o la sede no la tiene. */
const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

/**
 * 403 con `code = BRANCH_OUT_OF_SCOPE` (mismo código estable que
 * `requireBranchAccess`, `branch-access.ts`). El default handleServiceError
 * solo emite `{ error, message }` — el `code` se agrega explícitamente en
 * `routes.ts` (mismo patrón que CoverageExpiredError en scheduling/routes.ts).
 */
export class BranchOutOfScopeError extends AppError {
  readonly code = BRANCH_OUT_OF_SCOPE;

  constructor(message = "No tenés acceso a esta sede") {
    super(message, 403, BRANCH_OUT_OF_SCOPE);
  }
}

export interface StaffShiftOpen {
  id: number;
  branchId: number;
  branchName: string;
  checkedInAt: string;
}

export interface StaffShiftClosed extends StaffShiftOpen {
  checkedOutAt: string;
  durationMinutes: number;
}

export interface StaffChecklistItem {
  key: string;
  label: string;
  /** false = recordatorio (se ofrece, no bloquea el cierre). */
  required: boolean;
}

/**
 * Jornada abierta de `GET /me`. `cashCountedAt`: último cierre de caja
 * vinculado a ESTA jornada (o null). El check-out no vuelve a pedir contar la
 * caja si ya se contó (reporte 2026-10-06: el profe cerró la caja desde lejos
 * del QR y al hacer el check-out se la volvieron a pedir).
 */
export interface StaffShiftOpenMe extends StaffShiftOpen {
  cashCountedAt: string | null;
}

export interface StaffAttendanceMe {
  open: StaffShiftOpenMe | null;
  checklist: readonly StaffChecklistItem[];
}

export interface StaffShiftListRow {
  id: number;
  userId: number;
  userName: string;
  branchId: number;
  branchName: string;
  shiftDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number | null;
  /** Quién forzó el cierre (owner/admin) y por qué. null en un cierre normal. */
  forcedByName: string | null;
  forcedReason: string | null;
  /** `cobros`/`lote` null = no aplicaba (lote fuera de mié/sáb; cobros para roles sin plata). */
  checklist: {
    cobros: boolean | null;
    espacio: boolean;
    lote: boolean | null;
    /** Recordatorio de los profes (`coach`): true/false = lo tildó o no; null/ausente = no aplicaba (otro rol o jornada anterior al 2026-10-08). */
    videos?: boolean | null;
  } | null;
}

export interface StaffDashboardBranch {
  id: number;
  name: string;
}

export interface StaffOpenShiftRow {
  shiftId: number;
  userId: number;
  userName: string;
  branchId: number;
  branchName: string;
  checkedInAt: string;
}

export interface StaffStaleShiftRow extends StaffOpenShiftRow {
  shiftDate: string;
}

export interface StaffPersonSummary {
  userId: number;
  userName: string;
  branchNames: string[];
  shifts: number;
  totalMinutes: number;
}

export interface StaffDashboard {
  branches: StaffDashboardBranch[];
  openNow: StaffOpenShiftRow[];
  staleOpen: StaffStaleShiftRow[];
  totals: {
    shifts: number;
    closedShifts: number;
    openShifts: number;
    totalMinutes: number;
  };
  byPerson: StaffPersonSummary[];
}

/** Rango máximo permitido para `GET /shifts` (evita full scans desde el admin sobre un rango sin límite). */
const MAX_RANGE_DAYS = 62;

/** Tolerancia de reloj para `checkedOutAt` de un cierre forzado (no puede estar en el futuro). */
const FORCE_CHECKOUT_FUTURE_TOLERANCE_MS = 2 * 60 * 1000;
const FORCE_REASON_MIN = 3;
const FORCE_REASON_MAX = 255;

export class StaffAttendanceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Jornada abierta del usuario (`checked_out_at IS NULL`), la más reciente
   * si hubiera más de una por datos viejos, más el checklist fijo de cierre.
   */
  async getMe(
    ctx: TenantContext,
    userId: number,
    role?: string,
  ): Promise<StaffAttendanceMe> {
    const [row] = await this.db
      .select({
        id: schema.staffShifts.id,
        branchId: schema.staffShifts.branchId,
        branchName: schema.branches.name,
        branchTimezone: schema.branches.timezone,
        checkedInAt: schema.staffShifts.checkedInAt,
      })
      .from(schema.staffShifts)
      .innerJoin(
        schema.branches,
        eq(schema.staffShifts.branchId, schema.branches.id),
      )
      .where(
        and(
          tenantWhere(schema.staffShifts, ctx),
          eq(schema.staffShifts.userId, userId),
          isNull(schema.staffShifts.checkedOutAt),
        ),
      )
      .orderBy(desc(schema.staffShifts.checkedInAt))
      .limit(1);

    // El checklist depende del día EN LA SEDE (lote solo mié/sáb).
    const tz = row?.branchTimezone ?? DEFAULT_TZ;

    let cashCountedAt: Date | null = null;
    if (row) {
      const [last] = await this.db
        .select({ at: max(schema.cashCounts.countedAt) })
        .from(schema.cashCounts)
        .where(
          and(
            tenantWhere(schema.cashCounts, ctx),
            eq(schema.cashCounts.staffShiftId, row.id),
          ),
        );
      cashCountedAt = last?.at ?? null;
    }

    return {
      open: row
        ? {
            id: row.id,
            branchId: row.branchId,
            branchName: row.branchName,
            checkedInAt: row.checkedInAt.toISOString(),
            cashCountedAt: cashCountedAt ? cashCountedAt.toISOString() : null,
          }
        : null,
      // 2026-10-06: el checklist también depende del rol (coach_actividad: solo `espacio`).
      checklist: checklistForDow(dowInTz(tz), role),
    };
  }

  /**
   * Abre la jornada del usuario en la sede del QR escaneado.
   *
   * `scope` (además de `ctx`) es necesario porque el `branchId` sale del QR,
   * no de una ubicación fija del request — así que no se puede usar el
   * preHandler `requireBranchAccess` (que lee de query/params/body); el
   * chequeo de acceso se hace acá con el mismo `canAccessBranch` que usa ese
   * preHandler.
   */
  async checkIn(
    ctx: TenantContext,
    scope: CountryScope,
    userId: number,
    qrToken: string,
  ): Promise<StaffShiftOpen> {
    const qrPayload = validateQrToken(qrToken);
    if (!qrPayload) {
      throw new BadRequestError("Código QR inválido");
    }
    const branchId = qrPayload.branchId;

    const branchDelGimnasio = await resolveBranchDelGimnasio(
      ctx,
      branchId,
      this.db,
    );
    if (!branchDelGimnasio) {
      throw new NotFoundError("Sede no encontrada");
    }

    const puedeAcceder = await canAccessBranch(scope, branchId, this.db);
    if (!puedeAcceder) {
      throw new BranchOutOfScopeError();
    }

    const [branchRow] = await this.db
      .select({
        name: schema.branches.name,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, branchId),
        ),
      )
      .limit(1);
    // branchRow siempre existe acá: resolveBranchDelGimnasio ya probó que la
    // sede existe y es del gimnasio del ctx.

    const openShift = await this.findOpenShift(ctx, userId);
    if (openShift) {
      throw new ConflictError(
        `Ya tenés una jornada abierta en ${openShift.branchName}. Hacé check-out primero`,
      );
    }

    const now = new Date();
    const shiftDate = todayInTz(branchRow.timezone, now);

    const [inserted] = await this.db
      .insert(schema.staffShifts)
      .values(
        tenantValues(ctx, {
          userId,
          branchId,
          shiftDate,
          checkedInAt: now,
        }),
      )
      .$returningId();

    return {
      id: inserted.id,
      branchId,
      branchName: branchRow.name,
      checkedInAt: now.toISOString(),
    };
  }

  /**
   * Cierra la jornada abierta del usuario. Exige el QR de la MISMA sede del
   * check-in y el checklist completo — validado contra
   * `STAFF_CHECKLIST_KEYS`, nunca confiando en las claves que mande el body.
   */
  async checkOut(
    ctx: TenantContext,
    scope: CountryScope,
    userId: number,
    qrToken: string,
    checklist: Record<string, boolean>,
    role?: string,
  ): Promise<StaffShiftClosed> {
    const qrPayload = validateQrToken(qrToken);
    if (!qrPayload) {
      throw new BadRequestError("Código QR inválido");
    }
    const branchId = qrPayload.branchId;

    const branchDelGimnasio = await resolveBranchDelGimnasio(
      ctx,
      branchId,
      this.db,
    );
    if (!branchDelGimnasio) {
      throw new NotFoundError("Sede no encontrada");
    }

    const puedeAcceder = await canAccessBranch(scope, branchId, this.db);
    if (!puedeAcceder) {
      throw new BranchOutOfScopeError();
    }

    const openShift = await this.findOpenShift(ctx, userId);
    if (!openShift) {
      throw new ConflictError("No tenés una jornada abierta");
    }

    if (openShift.branchId !== branchId) {
      throw new BadRequestError(
        `La jornada abierta es de ${openShift.branchName}. Escaneá el QR de esa sede`,
      );
    }

    const now = new Date();
    // Lote del posnet solo miércoles y sábados, por el día en la zona de la
    // sede (no la del servidor).
    const [sede] = await this.db
      .select({ timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, branchId),
        ),
      )
      .limit(1);
    const dowSede = dowInTz(sede?.timezone ?? DEFAULT_TZ, now);
    const requiredKeys = requiredKeysForDow(dowSede, role);
    // Ítems recordatorio (no obligatorios, p. ej. `videos` de los profes): se
    // registra si lo tildó, sin bloquear el cierre.
    const offeredKeys = offeredKeysForDow(dowSede, role);
    // El 400 nombra lo que falta: si el ítem ni vino en el body, el cliente
    // armó la lista otro día (o es un bundle viejo) y el mensaje pide recargar.
    const faltantes = requiredKeys.filter((key) => checklist[key] !== true);
    if (faltantes.length > 0) {
      throw new BadRequestError(
        checklistIncompletoMessage(faltantes, checklist),
      );
    }

    // Se reconstruye el objeto en vez de guardar el body tal cual (defensa
    // contra mass-assignment): solo las keys exigidas hoy, todas `true`. Un
    // día sin lote lo guarda como null (no aplicaba), no como false. Idem
    // `cobros` (2026-10-06): un rol sin plata (coach_actividad) no lo tiene en
    // su checklist y se guarda null — la columna es JSON, así que admite null.
    const checklistSnapshot = {
      cobros: requiredKeys.includes("cobros") ? true : null,
      espacio: true,
      lote: requiredKeys.includes("lote") ? true : null,
      videos: offeredKeys.includes("videos") ? checklist.videos === true : null,
    };

    await this.db
      .update(schema.staffShifts)
      .set({ checkedOutAt: now, checklist: checklistSnapshot })
      .where(
        and(
          tenantWhere(schema.staffShifts, ctx),
          eq(schema.staffShifts.id, openShift.id),
        ),
      );

    const durationMinutes = Math.round(
      (now.getTime() - openShift.checkedInAt.getTime()) / 60000,
    );

    return {
      id: openShift.id,
      branchId: openShift.branchId,
      branchName: openShift.branchName,
      checkedInAt: openShift.checkedInAt.toISOString(),
      checkedOutAt: now.toISOString(),
      durationMinutes,
    };
  }

  /**
   * Sedes sobre las que el actor puede consultar el registro/tablero.
   * Misma fuente que el selector de sedes del admin (`listBranchesForScope`):
   * owner = todas (o las del `?country=`), admin = las de su país. Con
   * `branchId` (ya validado por `requireBranchAccess`) se queda con esa sede;
   * sin él descarta las virtuales (nadie ficha en "Templo Online").
   */
  async resolveBranches(
    scope: CountryScope,
    queryCountry: unknown,
    branchId: number | undefined,
  ): Promise<BranchListItem[]> {
    const all = await listBranchesForScope(
      this.db,
      scope,
      queryCountry,
      "staff-attendance.resolveBranches",
    );
    return branchId !== undefined
      ? all.filter((b) => b.id === branchId)
      : all.filter((b) => !b.isVirtual);
  }

  /**
   * Registro de jornadas de una o varias sedes en un rango de fechas (rol
   * `STAFF_ATTENDANCE_REPORT_ROLES`; el alcance de sedes ya lo resolvió la
   * ruta). `shiftDate` compara como string (`YYYY-MM-DD`, mismo criterio que
   * `tv_class_state.class_date`) — comparación lexicográfica válida por el
   * formato ISO fijo.
   */
  async listShifts(
    ctx: TenantContext,
    branchIds: number[],
    from: string,
    to: string,
  ): Promise<StaffShiftListRow[]> {
    this.assertRangoValido(from, to);
    return this.selectShifts(ctx, branchIds, [
      gte(schema.staffShifts.shiftDate, from),
      lte(schema.staffShifts.shiftDate, to),
    ]);
  }

  /**
   * Tablero de jornadas: en turno ahora, abiertas sin check-out de días
   * anteriores (ambas SIN límite de rango) y totales/horas por persona del
   * rango `from..to`. "Hoy" se evalúa en la TZ de CADA sede
   * (`todayInTz(branch.timezone)`), igual que se estampa `shift_date`.
   * `now` es inyectable para tests.
   */
  async getDashboard(
    ctx: TenantContext,
    branches: BranchListItem[],
    from: string,
    to: string,
    now: Date = new Date(),
  ): Promise<StaffDashboard> {
    this.assertRangoValido(from, to);
    const branchIds = branches.map((b) => b.id);

    const [rangeRows, openRows] = await Promise.all([
      this.listShifts(ctx, branchIds, from, to),
      this.selectShifts(ctx, branchIds, [
        isNull(schema.staffShifts.checkedOutAt),
      ]),
    ]);

    const tzByBranch = new Map(
      branches.map((b) => [b.id, b.timezone || DEFAULT_TZ]),
    );
    const todayByBranch = new Map<number, string>();
    const todayOf = (branchId: number): string => {
      let today = todayByBranch.get(branchId);
      if (today === undefined) {
        today = todayInTz(tzByBranch.get(branchId) ?? DEFAULT_TZ, now);
        todayByBranch.set(branchId, today);
      }
      return today;
    };

    const openNow: StaffOpenShiftRow[] = [];
    const staleOpen: StaffStaleShiftRow[] = [];
    for (const row of openRows) {
      const base: StaffOpenShiftRow = {
        shiftId: row.id,
        userId: row.userId,
        userName: row.userName,
        branchId: row.branchId,
        branchName: row.branchName,
        checkedInAt: row.checkedInAt,
      };
      if (row.shiftDate < todayOf(row.branchId)) {
        staleOpen.push({ ...base, shiftDate: row.shiftDate });
      } else {
        openNow.push(base);
      }
    }
    openNow.sort(
      (a, b) =>
        a.branchName.localeCompare(b.branchName) ||
        a.checkedInAt.localeCompare(b.checkedInAt),
    );
    staleOpen.sort(
      (a, b) =>
        a.shiftDate.localeCompare(b.shiftDate) ||
        a.branchName.localeCompare(b.branchName),
    );

    const totals = {
      shifts: rangeRows.length,
      closedShifts: 0,
      openShifts: 0,
      totalMinutes: 0,
    };
    const people = new Map<
      number,
      {
        userName: string;
        branches: Set<string>;
        shifts: number;
        minutes: number;
      }
    >();
    for (const row of rangeRows) {
      const person = people.get(row.userId) ?? {
        userName: row.userName,
        branches: new Set<string>(),
        shifts: 0,
        minutes: 0,
      };
      person.branches.add(row.branchName);
      person.shifts += 1;
      if (row.durationMinutes === null) {
        totals.openShifts += 1;
      } else {
        totals.closedShifts += 1;
        totals.totalMinutes += row.durationMinutes;
        person.minutes += row.durationMinutes;
      }
      people.set(row.userId, person);
    }

    const byPerson: StaffPersonSummary[] = [...people.entries()]
      .map(([userId, p]) => ({
        userId,
        userName: p.userName,
        branchNames: [...p.branches].sort((a, b) => a.localeCompare(b)),
        shifts: p.shifts,
        totalMinutes: p.minutes,
      }))
      .sort(
        (a, b) =>
          b.totalMinutes - a.totalMinutes ||
          a.userName.localeCompare(b.userName),
      );

    return {
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      openNow,
      staleOpen,
      totals,
      byPerson,
    };
  }

  /**
   * Cierre forzado de la jornada abierta de OTRA persona (owner/admin). Hoy
   * una jornada colgada bloquea el check-in de esa persona en todas las sedes.
   *
   * Orden de validación: motivo/fecha mal formados (400) → jornada inexistente
   * (404) → sede sin acceso (403, mismo `canAccessBranch` que el check-in) →
   * ya cerrada (409) → salida antes de la entrada o en el futuro (400).
   * El cierre deja `checklist = NULL` a propósito (marca de cierre no normal),
   * guarda quién y por qué, y escribe `audit_log` en la MISMA transacción.
   */
  async forceCheckOut(
    ctx: TenantContext,
    scope: CountryScope,
    actorId: number,
    shiftId: number,
    checkedOutAtIso: string,
    rawReason: string,
    now: Date = new Date(),
  ): Promise<StaffShiftListRow> {
    const reason = rawReason.trim();
    if (reason.length < FORCE_REASON_MIN || reason.length > FORCE_REASON_MAX) {
      throw new BadRequestError(
        `El motivo debe tener entre ${FORCE_REASON_MIN} y ${FORCE_REASON_MAX} caracteres`,
      );
    }
    const checkedOutAt = new Date(checkedOutAtIso);
    if (Number.isNaN(checkedOutAt.getTime())) {
      throw new BadRequestError("La hora de salida es inválida");
    }

    const [shift] = await this.db
      .select({
        id: schema.staffShifts.id,
        userId: schema.staffShifts.userId,
        branchId: schema.staffShifts.branchId,
        checkedInAt: schema.staffShifts.checkedInAt,
        checkedOutAt: schema.staffShifts.checkedOutAt,
      })
      .from(schema.staffShifts)
      .where(
        and(
          tenantWhere(schema.staffShifts, ctx),
          eq(schema.staffShifts.id, shiftId),
        ),
      )
      .limit(1);
    if (!shift) {
      throw new NotFoundError("Jornada no encontrada");
    }

    if (!(await canAccessBranch(scope, shift.branchId, this.db))) {
      throw new BranchOutOfScopeError();
    }

    if (shift.checkedOutAt !== null) {
      throw new ConflictError("La jornada ya está cerrada");
    }
    if (checkedOutAt.getTime() < shift.checkedInAt.getTime()) {
      throw new BadRequestError(
        "La hora de salida no puede ser anterior a la entrada",
      );
    }
    if (
      checkedOutAt.getTime() >
      now.getTime() + FORCE_CHECKOUT_FUTURE_TOLERANCE_MS
    ) {
      throw new BadRequestError(
        "La hora de salida no puede estar en el futuro",
      );
    }

    await this.db.transaction(async (tx) => {
      // Condicional: si otra request la cerró entre el SELECT y acá, no pisa.
      const [result] = await tx
        .update(schema.staffShifts)
        .set({
          checkedOutAt,
          checklist: null,
          forcedCheckoutBy: actorId,
          forcedCheckoutReason: reason,
        })
        .where(
          and(
            tenantWhere(schema.staffShifts, ctx),
            eq(schema.staffShifts.id, shift.id),
            isNull(schema.staffShifts.checkedOutAt),
          ),
        );
      if (Number(result.affectedRows ?? 0) === 0) {
        throw new ConflictError("La jornada ya está cerrada");
      }

      await auditLog.write(ctx, tx, {
        actorId,
        action: "staff_shift_forced_checkout",
        targetKind: "staff_shift",
        targetId: shift.id,
        reason,
        payload: {
          shiftId: shift.id,
          userId: shift.userId,
          branchId: shift.branchId,
          checkedInAt: shift.checkedInAt.toISOString(),
          checkedOutAt: checkedOutAt.toISOString(),
          reason,
        },
      });
    });

    const [row] = await this.selectShifts(
      ctx,
      [shift.branchId],
      [eq(schema.staffShifts.id, shift.id)],
    );
    return row;
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  /**
   * Query común de jornadas (+ mapeo a `StaffShiftListRow`) para el registro y
   * el tablero. Siempre con `tenantWhere` en `staff_shifts` y `users`.
   */
  private async selectShifts(
    ctx: TenantContext,
    branchIds: number[],
    extra: SQL[],
  ): Promise<StaffShiftListRow[]> {
    if (branchIds.length === 0) return [];

    // Quién forzó el cierre (LEFT: el filtro de tenant va en el ON, nunca en el
    // WHERE, o convertiría el LEFT en INNER).
    const forcer = alias(schema.users, "forcer");

    const rows = await this.db
      .select({
        id: schema.staffShifts.id,
        userId: schema.staffShifts.userId,
        userFirstName: schema.users.firstName,
        userLastName: schema.users.lastName,
        branchId: schema.staffShifts.branchId,
        branchName: schema.branches.name,
        shiftDate: schema.staffShifts.shiftDate,
        checkedInAt: schema.staffShifts.checkedInAt,
        checkedOutAt: schema.staffShifts.checkedOutAt,
        checklist: schema.staffShifts.checklist,
        forcedByFirstName: forcer.firstName,
        forcedByLastName: forcer.lastName,
        forcedReason: schema.staffShifts.forcedCheckoutReason,
      })
      .from(schema.staffShifts)
      .innerJoin(
        schema.branches,
        eq(schema.staffShifts.branchId, schema.branches.id),
      )
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.staffShifts.userId, schema.users.id),
        ),
      )
      .leftJoin(
        forcer,
        and(
          tenantWhere(forcer, ctx),
          eq(schema.staffShifts.forcedCheckoutBy, forcer.id),
        ),
      )
      .where(
        and(
          tenantWhere(schema.staffShifts, ctx),
          inArray(schema.staffShifts.branchId, branchIds),
          ...extra,
        ),
      )
      .orderBy(desc(schema.staffShifts.checkedInAt));

    return rows.map((row) => {
      const durationMinutes = row.checkedOutAt
        ? Math.round(
            (row.checkedOutAt.getTime() - row.checkedInAt.getTime()) / 60000,
          )
        : null;
      return {
        id: row.id,
        userId: row.userId,
        userName: `${row.userFirstName} ${row.userLastName}`,
        branchId: row.branchId,
        branchName: row.branchName,
        shiftDate: row.shiftDate,
        checkedInAt: row.checkedInAt.toISOString(),
        checkedOutAt: row.checkedOutAt ? row.checkedOutAt.toISOString() : null,
        durationMinutes,
        forcedByName:
          row.forcedByFirstName !== null
            ? `${row.forcedByFirstName} ${row.forcedByLastName ?? ""}`.trim()
            : null,
        forcedReason: row.forcedReason ?? null,
        checklist: row.checklist ?? null,
      };
    });
  }

  private async findOpenShift(
    ctx: TenantContext,
    userId: number,
  ): Promise<{
    id: number;
    branchId: number;
    branchName: string;
    checkedInAt: Date;
  } | null> {
    const [row] = await this.db
      .select({
        id: schema.staffShifts.id,
        branchId: schema.staffShifts.branchId,
        branchName: schema.branches.name,
        checkedInAt: schema.staffShifts.checkedInAt,
      })
      .from(schema.staffShifts)
      .innerJoin(
        schema.branches,
        eq(schema.staffShifts.branchId, schema.branches.id),
      )
      .where(
        and(
          tenantWhere(schema.staffShifts, ctx),
          eq(schema.staffShifts.userId, userId),
          isNull(schema.staffShifts.checkedOutAt),
        ),
      )
      .orderBy(desc(schema.staffShifts.checkedInAt))
      .limit(1);

    return row ?? null;
  }

  /** Noon-UTC (mismo patrón que `date-utils.ts`) para evitar drift de DST/borde de día. */
  private assertRangoValido(from: string, to: string): void {
    const fromDate = new Date(`${from}T12:00:00Z`);
    const toDate = new Date(`${to}T12:00:00Z`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestError("Rango de fechas inválido");
    }
    if (toDate.getTime() < fromDate.getTime()) {
      throw new BadRequestError("El rango de fechas es inválido");
    }
    const days =
      Math.round(
        (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestError(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
    }
  }
}
