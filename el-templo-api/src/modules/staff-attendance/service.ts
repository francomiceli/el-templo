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
import { eq, and, isNull, desc, gte, lte } from "drizzle-orm";
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
import { todayInTz } from "../shared/date-utils";
import { checklistForDow, requiredKeysForDow } from "./checklist";
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
}

export interface StaffAttendanceMe {
  open: StaffShiftOpen | null;
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
  checklist: { cobros: boolean; espacio: boolean; lote: boolean | null } | null;
}

/** Rango máximo permitido para `GET /shifts` (evita full scans desde el admin sobre un rango sin límite). */
const MAX_RANGE_DAYS = 62;

export class StaffAttendanceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Jornada abierta del usuario (`checked_out_at IS NULL`), la más reciente
   * si hubiera más de una por datos viejos, más el checklist fijo de cierre.
   */
  async getMe(ctx: TenantContext, userId: number): Promise<StaffAttendanceMe> {
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

    return {
      open: row
        ? {
            id: row.id,
            branchId: row.branchId,
            branchName: row.branchName,
            checkedInAt: row.checkedInAt.toISOString(),
          }
        : null,
      checklist: checklistForDow(dowInTz(tz)),
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
        and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, branchId)),
      )
      .limit(1);
    const requiredKeys = requiredKeysForDow(
      dowInTz(sede?.timezone ?? DEFAULT_TZ, now),
    );
    const checklistCompleto = requiredKeys.every(
      (key) => checklist[key] === true,
    );
    if (!checklistCompleto) {
      throw new BadRequestError("Marcá todos los ítems del checklist");
    }

    // Se reconstruye el objeto en vez de guardar el body tal cual (defensa
    // contra mass-assignment): solo las keys exigidas hoy, todas `true`. Un
    // día sin lote lo guarda como null (no aplicaba), no como false.
    const checklistSnapshot = {
      cobros: true,
      espacio: true,
      lote: requiredKeys.includes("lote") ? true : null,
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
   * Registro de jornadas de una sede en un rango de fechas (rol
   * `STAFF_ATTENDANCE_REPORT_ROLES`, `requireBranchAccess` ya corrió en la
   * ruta). `shiftDate` compara como string (`YYYY-MM-DD`, mismo criterio que
   * `tv_class_state.class_date`) — comparación lexicográfica válida por el
   * formato ISO fijo.
   */
  async listShifts(
    ctx: TenantContext,
    branchId: number,
    from: string,
    to: string,
  ): Promise<StaffShiftListRow[]> {
    this.assertRangoValido(from, to);

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
      .where(
        and(
          tenantWhere(schema.staffShifts, ctx),
          eq(schema.staffShifts.branchId, branchId),
          gte(schema.staffShifts.shiftDate, from),
          lte(schema.staffShifts.shiftDate, to),
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
        checklist: row.checklist ?? null,
      };
    });
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

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
