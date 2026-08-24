// Module: finance — phase 138 (cash_registers entity)
//
// CashRegisterService is the finance-facade home for the caja resolver
// (D-01/D-02) and the per-caja balance (added in plan 03). It mirrors the
// BalanceService constructor shape (db, log).
//
// `resolveCashRegister` is the SINGLE reusable choke-point that derives the
// caja of a payment 100% from its `paymentMethod` (D-01). It is wired into the
// single TransactionService.create() insert site so every create path
// auto-stamps `cash_register_id`, and is REUSED verbatim by phase 140 (carga
// única del profe) — do NOT reinvent the resolver there.

import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import { firmMoneyConditions } from "./firm-money";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import type {
  BankAccountRow,
  CajaPeriodMovement,
  CajaSaldoRow,
  CashRegisterBalance,
  CostCenter,
  CostCenterItem,
  CreateBankAccountInput,
  PaymentMethod,
  UpdateBankAccountInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

export class CashRegisterService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Derive the caja a payment lands in, 100% from its `paymentMethod` (D-01).
   * This is the single reusable choke-point (D-02) reused by phase 140.
   *
   * Rule:
   *   - aura_credit / internal → NULL (not firm cash in any caja).
   *   - transfer / card /      → banco caja of `currency` (resolved BY currency,
   *     direct_debit             so a currency mismatch is structurally
   *                              impossible — no guard needed). La domiciliación
   *                              entra por el banco igual que una transferencia:
   *                              nunca toca la caja efectivo de la sede.
   *   - cash                   → efectivo caja of `branchId`. Here the caja's
   *                              currency could differ from the tx currency
   *                              (e.g. an EUR cash payment recorded at an ARS
   *                              branch), so the currency guard (D-09/CAJA-04)
   *                              fires — mirror of balance-service.ts:154-158.
   *
   * @returns the resolved cash_register id, or NULL for aura_credit/internal.
   * @throws BadRequestError when no matching active caja exists, or (cash) when
   *         the resolved efectivo caja's currency differs from `currency`.
   */
  async resolveCashRegister(
    ctx: TenantContext,
    paymentMethod: PaymentMethod,
    branchId: number | null,
    currency: string,
  ): Promise<number | null> {
    if (paymentMethod === "aura_credit" || paymentMethod === "internal") {
      return null;
    }

    if (
      paymentMethod === "transfer" ||
      paymentMethod === "card" ||
      paymentMethod === "direct_debit"
    ) {
      // Phase 146 (CAJA-03 / LOW 1): con multiples cajas banco de la misma moneda
      // (Banco ARS + Galicia + Mercado Pago), el destructuring [banco] sin orden
      // daria una caja SUGERIDA no-determinista. orderBy(id) la fija a la mas
      // antigua de forma estable; la caja REAL la elige gestion al validar
      // (validate(cashRegisterId)), asi que esta sigue siendo solo la sugerencia.
      const [banco] = await this.db
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .where(
          and(
            // Fase 172: sin este filtro el cobro de un gimnasio podía aterrizar
            // en la caja banco del vecino — la más antigua por id, que después
            // de la fase 168 puede perfectamente ser de otro tenant.
            tenantWhere(schema.cashRegisters, ctx),
            eq(schema.cashRegisters.type, "banco"),
            eq(schema.cashRegisters.currency, currency),
            eq(schema.cashRegisters.isActive, true),
          ),
        )
        .orderBy(schema.cashRegisters.id)
        .limit(1);
      if (!banco) {
        throw new BadRequestError(`No existe caja banco para ${currency}`);
      }
      return banco.id;
    }

    // paymentMethod === "cash" → efectivo de la sucursal. Phase 139: branchId
    // puede ser null en el ledger (movimientos/egresos branch-less), pero esos
    // SIEMPRE pasan un cashRegisterId explícito y nunca llegan al resolver. Un
    // cobro 'cash' sin sucursal no tiene caja efectivo derivable — guard explícito.
    if (branchId === null) {
      throw new BadRequestError(
        "No se puede resolver la caja efectivo sin sucursal",
      );
    }
    const [efectivo] = await this.db
      .select({
        id: schema.cashRegisters.id,
        currency: schema.cashRegisters.currency,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, branchId),
          eq(schema.cashRegisters.isActive, true),
        ),
      )
      .limit(1);
    if (!efectivo) {
      throw new BadRequestError(
        `No existe caja efectivo para la sucursal ${branchId}`,
      );
    }
    // Currency guard (D-09/CAJA-04): a caja never mixes currencies.
    if (efectivo.currency !== currency) {
      throw new BadRequestError(
        `Moneda inconsistente: la caja es ${efectivo.currency}, el cobro es ${currency}`,
      );
    }
    return efectivo.id;
  }

  /**
   * Phase 151 (COBRO-04): cuentas banco seleccionables en la PoS de Cobros. Solo
   * activas (type='banco' AND is_active=true), ordenadas por id asc, shape lean
   * `{ id, name, currency }` (sin saldos — el profe NO ve saldos, T-151-02).
   * Con `currency` acota a esa moneda (para ofrecer solo cuentas de la moneda del
   * cobro); sin `currency` devuelve todas las cuentas banco activas.
   */
  async listActiveBankAccounts(
    ctx: TenantContext,
    currency?: string,
  ): Promise<Array<{ id: number; name: string; currency: string }>> {
    const conditions = [
      eq(schema.cashRegisters.type, "banco"),
      eq(schema.cashRegisters.isActive, true),
    ];
    if (currency !== undefined) {
      conditions.push(eq(schema.cashRegisters.currency, currency));
    }
    return this.db
      .select({
        id: schema.cashRegisters.id,
        name: schema.cashRegisters.name,
        currency: schema.cashRegisters.currency,
      })
      .from(schema.cashRegisters)
      .where(and(tenantWhere(schema.cashRegisters, ctx), ...conditions))
      .orderBy(asc(schema.cashRegisters.id));
  }

  /**
   * Phase 151 (COBRO-04 / T-151-01): valida la cuenta banco ELEGIDA en la PoS
   * contra el cobro. A diferencia de getBankAccountById (que solo guarda NotFound
   * + type='banco'), este assert RECHAZA como BadRequest (400) toda cuenta que no
   * sea type='banco' + activa + con la MISMA moneda del cobro — es el choke-point
   * de confianza antes de que la ruta coach-load impute el id como caja del charge
   * (mismo mensaje de moneda que resolveCashRegister/balance-service para el guard
   * de moneda). Devuelve la fila validada.
   *
   * Fase 172: una cuenta de OTRO gimnasio no matchea el SELECT y cae en la misma
   * rama "no existe o está inactiva" (400 genérico, sin filtrar existencia). Es
   * el choke-point que impide imputar un cobro a la cuenta bancaria del vecino.
   *
   * @throws BadRequestError cuando no existe / no es banco / está inactiva, o
   *         cuando la moneda de la cuenta no coincide con la del cobro.
   */
  async assertChosenBankAccount(
    ctx: TenantContext,
    id: number,
    currency: string,
  ) {
    const [caja] = await this.db
      .select({
        id: schema.cashRegisters.id,
        name: schema.cashRegisters.name,
        currency: schema.cashRegisters.currency,
        isActive: schema.cashRegisters.isActive,
        type: schema.cashRegisters.type,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, id),
        ),
      )
      .limit(1);
    if (!caja || caja.type !== "banco" || !caja.isActive) {
      throw new BadRequestError("La cuenta elegida no existe o está inactiva");
    }
    if (caja.currency !== currency) {
      throw new BadRequestError(
        `Moneda inconsistente: la cuenta es ${caja.currency}, el cobro es ${currency}`,
      );
    }
    return caja;
  }

  /**
   * Derived firm balance of a caja (D-06/D-08/CAJA-03). NOT materialized — the
   * saldo is always computed on read, and the derivation is hidden behind this
   * signature so phase 139 can extend the body (outflows) without changing the
   * contract for callers.
   *
   * firmeBalance = opening_balance + Σ(validados, no anulados) DESDE cutoff_date,
   *   reusing firmMoneyConditions() so it inherits the canonical phase-137 filter
   *   (never inline `validado` / `voided_at IS NULL` here — D-08/T-138-09).
   *
   * pendienteAmount = Σ(validation_status='pendiente', no anulados) DESDE cutoff,
   *   returned SEPARATELY and NEVER added to firmeBalance (CAJA-03/T-138-07).
   *
   * Pre-cutoff rows are labeled for history but excluded by the
   * gte(transactionDate, cutoffDate) gate on every SUM (T-138-08).
   *
   * SIGNED in phase 139 (D-09): firmeBalance = opening + Σ(inflow validados) −
   * Σ(outflow validados), both since cutoff. The outflow term subtracts EVERY
   * validado outflow row of this caja since cutoff with NO kind filter — that
   * intentionally covers kind='expense', the kind='cash_transfer' outflow leg,
   * AND any kind='refund' outflow (a cash refund genuinely leaves the caja, so
   * subtracting it is correct; the cutoff gate excludes historical noise). The
   * symmetry is direction-generic: an 'adjustment' reconciliation row is summed
   * with the correct sign by its own `direction`.
   *
   * @throws NotFoundError when no caja exists for `cashRegisterId`.
   */
  async getBalance(
    ctx: TenantContext,
    cashRegisterId: number,
  ): Promise<CashRegisterBalance> {
    const [caja] = await this.db
      .select({
        openingBalance: schema.cashRegisters.openingBalance,
        currency: schema.cashRegisters.currency,
        cutoffDate: schema.cashRegisters.cutoffDate,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, cashRegisterId),
        ),
      )
      .limit(1);
    if (!caja) {
      throw new NotFoundError(`No existe la caja ${cashRegisterId}`);
    }

    // firmeBalance: clone of getSummary's firm SUM (transaction-service.ts),
    // scoped to THIS caja, inflow-only, gated by cutoff, reusing the canonical
    // firm-money filter.
    const [firmRow] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          // Las DOS tablas del saldo son strict y cada statement nombra la suya:
          // `cash_registers` en el SELECT de arriba, `financial_transactions` en
          // cada SUM. Sin esto, una transaccion de otro gimnasio apuntando a esta
          // caja sumaria al saldo (riesgo residual que dejo abierto el 172-06).
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
          eq(schema.financialTransactions.direction, "inflow"),
          ...firmMoneyConditions(),
          gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
        ),
      );
    // outflowTotal: the symmetric SUM of this caja's validado OUTflow rows since
    // cutoff. Same firmMoneyConditions() spread + same cutoff gate as the inflow
    // SUM, but direction='outflow'. NO kind filter (D-09): expense, the
    // cash_transfer outflow leg, and refund outflows ALL subtract — every kind of
    // money that genuinely leaves the caja.
    const [outflowRow] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
          eq(schema.financialTransactions.direction, "outflow"),
          ...firmMoneyConditions(),
          gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
        ),
      );

    const firmeBalance =
      caja.openingBalance +
      Number(firmRow?.total ?? 0) -
      Number(outflowRow?.total ?? 0);

    // pendienteAmount: a SEPARATE SUM (validation_status='pendiente', not
    // voided, since cutoff). NEVER added to firmeBalance (CAJA-03).
    const [pendRow] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, ctx),
          eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
          eq(schema.financialTransactions.direction, "inflow"),
          eq(schema.financialTransactions.validationStatus, "pendiente"),
          isNull(schema.financialTransactions.voidedAt),
          gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
        ),
      );
    const pendienteAmount = Number(pendRow?.total ?? 0);

    return {
      cashRegisterId,
      currency: caja.currency,
      firmeBalance,
      pendienteAmount,
    };
  }

  /**
   * Movimiento FIRME de una caja en un rango de fechas (inclusive), separado en
   * entradas y salidas (UAT caja/cobros 2026-07-21).
   *
   * Por qué esto y no un "saldo a fecha": el firme es acumulado desde el
   * cutoff_date de la caja y representa la plata que HAY hoy; recalcularlo a una
   * fecha pasada daría un número que ya no coincide con la caja física. Lo que
   * el staff necesita es el delta del período ("la caja tenía 100, cargué 100,
   * ¿por qué el KPI dice 200?"), que es exactamente esto.
   *
   * Mismos filtros que getBalance: sólo plata firme (firmMoneyConditions) y
   * nunca antes del cutoff — un rango que empiece antes se recorta al cutoff,
   * porque esas filas no forman parte del saldo de esta caja. Sin filtro de
   * kind: todo lo que entra suma y todo lo que sale resta (D-09).
   */
  async getPeriodMovement(
    ctx: TenantContext,
    cashRegisterId: number,
    dateFrom: string,
    dateTo: string,
  ): Promise<CajaPeriodMovement> {
    const [caja] = await this.db
      .select({ cutoffDate: schema.cashRegisters.cutoffDate })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, cashRegisterId),
        ),
      )
      .limit(1);
    if (!caja) {
      throw new NotFoundError(`No existe la caja ${cashRegisterId}`);
    }
    // El cutoff gana sobre un dateFrom anterior: antes de esa fecha la caja no
    // acumula (los históricos quedaron fuera a propósito en 0154).
    const from = dateFrom < caja.cutoffDate ? caja.cutoffDate : dateFrom;

    const sumFor = async (direction: "inflow" | "outflow"): Promise<number> => {
      const [row] = await this.db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
        })
        .from(schema.financialTransactions)
        .where(
          and(
            // Las DOS tablas del método son strict y cada statement nombra la
            // suya: `cash_registers` arriba, `financial_transactions` acá.
            tenantWhere(schema.financialTransactions, ctx),
            eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
            eq(schema.financialTransactions.direction, direction),
            ...firmMoneyConditions(),
            gte(schema.financialTransactions.transactionDate, from),
            lte(schema.financialTransactions.transactionDate, dateTo),
          ),
        );
      return Number(row?.total ?? 0);
    };

    const [inflow, outflow] = await Promise.all([
      sumFor("inflow"),
      sumFor("outflow"),
    ]);
    return { dateFrom: from, dateTo, inflow, outflow, net: inflow - outflow };
  }

  /**
   * Phase 141 (REP-02): list every ACTIVE caja with its firme + pendiente saldo,
   * composing the existing getBalance(id) per caja (no new balance SQL). Returns
   * a flat array; the frontend groups by type (efectivo sucursal/central/banco)
   * and subtotalizes SOLO por moneda (D-06), never cross-currency.
   *
   * Scope (Franco-confirmed 2026-06-24): non-owner sees ONLY their country's
   * sucursal efectivo cajas. Branch-less central/banco cajas (branch_id NULL)
   * are country-agnostic → OWNER-ONLY, mirroring enforceCajaScope semantics. A
   * non-owner is filtered to cajas whose branch.country === scope.country.
   *
   * Per-caja getBalance is fine at this scale (a handful of cajas — no N+1
   * concern; 138 keeps the saldo derived, materialize only with perf evidence).
   */
  async listActiveCajasWithBalance(
    ctx: TenantContext,
    scope?: {
      isOwner: boolean;
      country: string | null;
    },
    /** Rango opcional: agrega el movimiento firme del período por caja. */
    period?: { dateFrom: string; dateTo: string },
  ): Promise<CajaSaldoRow[]> {
    const cajas = await this.db
      .select({
        id: schema.cashRegisters.id,
        name: schema.cashRegisters.name,
        type: schema.cashRegisters.type,
        branchId: schema.cashRegisters.branchId,
        currency: schema.cashRegisters.currency,
        branchCountry: schema.branches.country,
      })
      .from(schema.cashRegisters)
      .leftJoin(
        schema.branches,
        // El filtro de gimnasio de `branches` va en el ON y JAMÁS en el WHERE
        // (hallazgo 172-03): en el WHERE, `NULL = 1` es falso para las cajas
        // central/banco (branch_id NULL) y el LEFT se vuelve INNER — esas cajas
        // desaparecerían del listado de saldos en silencio, y el lint saldría
        // verde igual. `branches` no es tabla strict, pero se scopea igual
        // porque el país de la sucursal decide qué ve un no-owner.
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.cashRegisters.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.isActive, true),
        ),
      );

    const out: CajaSaldoRow[] = [];
    for (const c of cajas) {
      // Non-owner scope: branch-less cajas (central/banco) are owner-only, and
      // a branch-scoped caja is visible only when its country matches.
      if (scope && !scope.isOwner) {
        if (c.branchId === null) continue; // central/banco → owner-only
        if (c.branchCountry !== scope.country) continue; // cross-country → hide
      }
      const bal = await this.getBalance(ctx, c.id);
      out.push({
        cashRegisterId: c.id,
        name: c.name,
        type: c.type,
        branchId: c.branchId,
        currency: c.currency,
        firmeBalance: bal.firmeBalance,
        pendienteAmount: bal.pendienteAmount,
        period: period
          ? await this.getPeriodMovement(
              ctx,
              c.id,
              period.dateFrom,
              period.dateTo,
            )
          : null,
      });
    }
    return out;
  }

  /**
   * Phase 147 (EGR-01): centros de costo activos para el selector del dialog de
   * egreso. cost_centers es un catálogo análogo a cash_registers, así que vive en
   * este service (el "service de catálogos de caja") en lugar de crear un service
   * nuevo de un solo método — el ABM está diferido (decisión registrada en
   * AUTONOMOUS-DECISIONS-v5.3.md). Cuando `country` es null (owner sin filtro)
   * devuelve los de todos los países; si no, acota a ese país. Ordenado por name.
   */
  async listActiveCostCenters(
    ctx: TenantContext,
    country: string | null,
  ): Promise<CostCenterItem[]> {
    const conditions = [eq(schema.costCenters.isActive, true)];
    if (country !== null) {
      conditions.push(eq(schema.costCenters.country, country));
    }
    return (
      this.db
        .select({
          id: schema.costCenters.id,
          name: schema.costCenters.name,
          country: schema.costCenters.country,
        })
        .from(schema.costCenters)
        // El filtro de gimnasio va acá y NO como primer elemento de `conditions`:
        // el lint de tenancy razona por STATEMENT y el que nombra la tabla es el
        // de la query, no el del array (hallazgo 172-02/172-04). El SQL es el
        // mismo — `tenant_id` queda igual como primer término del AND.
        .where(and(tenantWhere(schema.costCenters, ctx), ...conditions))
        .orderBy(asc(schema.costCenters.name))
    );
  }

  // -- Phase 152: ABM de centros de costo (CAJA-05, levanta EGR-F2 de v5.3) --
  //
  // CRUD análogo al ABM de cuentas bancarias (fase 150): crear / renombrar /
  // desactivar / reactivar / listAll (incl. inactivos). Sin borrado físico
  // (D-08): baja = is_active=false, para conservar los egresos históricos ya
  // imputados a la categoría. La seguridad real vive en las rutas (149 D-04):
  // este service confía en que el caller ya pasó el guard ADMIN_ROLES.

  /**
   * Lee un centro de costo por id, mapeado a CostCenter (incl. isActive).
   *
   * Fase 172 (D-09): el filtro de gimnasio convierte "el centro de otro
   * gimnasio" en NotFound — 404, NUNCA 403. Es deliberado: un 403 confirmaría
   * que el id existe en otro lado. No lo "corrijas" a 403 más adelante.
   *
   * @throws NotFoundError cuando no existe (o es de otro gimnasio).
   */
  private async getCostCenterRow(
    ctx: TenantContext,
    id: number,
  ): Promise<CostCenter> {
    const [row] = await this.db
      .select({
        id: schema.costCenters.id,
        name: schema.costCenters.name,
        country: schema.costCenters.country,
        isActive: schema.costCenters.isActive,
      })
      .from(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundError(`No existe el centro de costo ${id}`);
    }
    return row;
  }

  /**
   * Guard de unicidad de nombre por país (D-08). Belt-and-suspenders con el
   * uniqueIndex `uq_cost_centers_name_country` de la migración 0165: lanza
   * ConflictError ANTES del write con un mensaje claro (el índice DB solo daría
   * un error genérico de duplicado). La comparación se apoya en la collation
   * MySQL default (case-insensitive), así que `eq(name)` matchea igual que el
   * índice único — no se distingue "Alquiler" de "alquiler". `excludeId` permite
   * renombrar una fila a un nombre que ella misma ya tenía sin auto-colisionar.
   *
   * Fase 172: la unicidad es POR GIMNASIO (el filtro de tenant va primero, antes
   * de comparar el nombre). Dos gimnasios pueden tener un centro "Alquiler" cada
   * uno y eso es correcto — sin el filtro, el alta del gimnasio B chocaría contra
   * el nombre del A y el 409 le revelaría los nombres del vecino (T-172-06-04).
   * La unique compuesta de la base ya lleva `tenant_id` (fase 168), así que este
   * guard y el índice vuelven a decir lo mismo.
   *
   * @throws ConflictError cuando ya existe otro centro con ese (name, country).
   */
  private async assertUniqueName(
    ctx: TenantContext,
    name: string,
    country: string,
    excludeId?: number,
  ): Promise<void> {
    const conditions = [
      eq(schema.costCenters.name, name),
      eq(schema.costCenters.country, country),
    ];
    if (excludeId !== undefined) {
      conditions.push(ne(schema.costCenters.id, excludeId));
    }
    const [existing] = await this.db
      .select({ id: schema.costCenters.id })
      .from(schema.costCenters)
      .where(and(tenantWhere(schema.costCenters, ctx), ...conditions))
      .limit(1);
    if (existing) {
      throw new ConflictError(
        `Ya existe un centro de costo "${name}" en este país`,
      );
    }
  }

  /**
   * Crea un centro de costo (CAJA-05). Trimea el nombre, valida unicidad por
   * país ANTES de escribir y devuelve la fila completa. `is_active` arranca en
   * true (default del schema).
   *
   * @throws BadRequestError cuando el nombre queda vacío tras el trim.
   * @throws ConflictError cuando ya existe ese nombre en el país.
   */
  async createCostCenter(
    ctx: TenantContext,
    name: string,
    country: string,
  ): Promise<CostCenter> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestError("El nombre del centro de costo es obligatorio");
    }
    await this.assertUniqueName(ctx, trimmed, country);
    const inserted = await this.db
      .insert(schema.costCenters)
      // `tenantValues` estampa el gimnasio DESPUÉS del objeto, así que un
      // `tenantId` que viniera del body no puede ganar (T-172-06-03).
      .values(tenantValues(ctx, { name: trimmed, country }));
    const id = Number(inserted[0].insertId);
    this.log.info(
      { costCenterId: id, country, tenantId: ctx.tenantId },
      "Centro de costo creado",
    );
    return this.getCostCenterRow(ctx, id);
  }

  /**
   * Renombra un centro de costo (CAJA-05). Revalida unicidad por país
   * excluyéndose a sí mismo (D-08). El país NO se cambia — el ABM edita solo el
   * nombre. Guard NotFound.
   *
   * @throws NotFoundError cuando no existe.
   * @throws BadRequestError cuando el nombre queda vacío tras el trim.
   * @throws ConflictError cuando el nuevo nombre ya existe en el país.
   */
  async renameCostCenter(
    ctx: TenantContext,
    id: number,
    name: string,
  ): Promise<CostCenter> {
    const current = await this.getCostCenterRow(ctx, id);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestError("El nombre del centro de costo es obligatorio");
    }
    await this.assertUniqueName(ctx, trimmed, current.country, id);
    await this.db
      .update(schema.costCenters)
      .set({ name: trimmed })
      // El SELECT previo ya cortó con 404 si la fila es de otro gimnasio; el
      // filtro va igual en el UPDATE (defensa en profundidad: el WHERE de una
      // escritura nunca se apoya en una lectura anterior — T-172-06-02).
      .where(
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, id),
        ),
      );
    this.log.info({ costCenterId: id }, "Centro de costo renombrado");
    return this.getCostCenterRow(ctx, id);
  }

  /**
   * Baja lógica de un centro de costo (CAJA-05 / D-08): set is_active=false, sin
   * DELETE — conserva los egresos históricos imputados. registerExpense ya
   * filtra is_active=true, así que desactivar lo saca del selector de egresos sin
   * cambios adicionales. Guard NotFound.
   *
   * @throws NotFoundError cuando no existe.
   */
  async deactivateCostCenter(
    ctx: TenantContext,
    id: number,
  ): Promise<CostCenter> {
    await this.getCostCenterRow(ctx, id);
    await this.db
      .update(schema.costCenters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, id),
        ),
      );
    this.log.info(
      { costCenterId: id },
      "Centro de costo desactivado (baja lógica)",
    );
    return this.getCostCenterRow(ctx, id);
  }

  /**
   * Reactiva un centro de costo dado de baja (CAJA-05): set is_active=true. Guard
   * NotFound.
   *
   * @throws NotFoundError cuando no existe.
   */
  async reactivateCostCenter(
    ctx: TenantContext,
    id: number,
  ): Promise<CostCenter> {
    await this.getCostCenterRow(ctx, id);
    await this.db
      .update(schema.costCenters)
      .set({ isActive: true })
      .where(
        and(
          tenantWhere(schema.costCenters, ctx),
          eq(schema.costCenters.id, id),
        ),
      );
    this.log.info({ costCenterId: id }, "Centro de costo reactivado");
    return this.getCostCenterRow(ctx, id);
  }

  /**
   * Lista TODOS los centros de costo (CAJA-05): activos Y dados de baja (NO
   * filtra por is_active), para el ABM — espeja `listBankAccounts` que dropea el
   * filtro isActive. Cuando `country` es null (owner sin filtro) devuelve los de
   * todos los países; si no, acota. Ordenado por name.
   */
  async listAllCostCenters(
    ctx: TenantContext,
    country: string | null,
  ): Promise<CostCenter[]> {
    // El WHERE dejó de ser condicional: el filtro de gimnasio SIEMPRE va, y el
    // de país se suma sólo cuando hay país. La rama sin `.where()` de antes es
    // exactamente la forma en que un listado se escapa del gimnasio.
    //
    // El `tenantWhere` va INLINE en la query y no como primer elemento de
    // `conditions`: el lint razona por STATEMENT y el que nombra la tabla es
    // este, no el `const conditions` de arriba (hallazgo 172-02/172-04).
    const conditions =
      country !== null ? [eq(schema.costCenters.country, country)] : [];
    return this.db
      .select({
        id: schema.costCenters.id,
        name: schema.costCenters.name,
        country: schema.costCenters.country,
        isActive: schema.costCenters.isActive,
      })
      .from(schema.costCenters)
      .where(and(tenantWhere(schema.costCenters, ctx), ...conditions))
      .orderBy(asc(schema.costCenters.name));
  }

  // -- Phase 150: ABM de cuentas bancarias (CTA-01 / CTA-02) -----------------

  /** YYYY-MM-DD de hoy — cutoff_date de una cuenta banco nueva (D-05). */
  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Deriva el `name` visible de la cuenta (D-03). Con alias: "Banco · alias".
   * Sin alias pero con CBU/CVU o número: "Banco ····NNNN" (últimos 4 dígitos).
   * Sin ningún identificador con dígitos: solo el nombre del banco.
   */
  private deriveBankAccountName(
    bankName: string,
    accountAlias?: string | null,
    cbuCvu?: string | null,
    accountNumber?: string | null,
  ): string {
    const alias = accountAlias?.trim();
    if (alias) {
      return `${bankName} · ${alias}`;
    }
    const digits = (cbuCvu ?? accountNumber ?? "").replace(/\D/g, "");
    if (digits.length >= 4) {
      return `${bankName} ····${digits.slice(-4)}`;
    }
    return bankName;
  }

  /**
   * Regla "uno de dos" (D-02): una cuenta banco necesita al menos CBU/CVU O
   * Alias. Se valida en el SERVICE (no en el schema) sobre el estado resultante,
   * espejo del patrón de registerExpense. Validación de formato liviana
   * (Claude's Discretion): NO se rechaza por dígito verificador ni se bloquean
   * cuentas del exterior — solo se exige la presencia de un identificador.
   */
  private assertTransferIdentifier(
    cbuCvu?: string | null,
    accountAlias?: string | null,
  ): void {
    const hasCbu = !!cbuCvu?.trim();
    const hasAlias = !!accountAlias?.trim();
    if (!hasCbu && !hasAlias) {
      throw new BadRequestError("Se requiere CBU/CVU o Alias");
    }
  }

  /**
   * Lee una cuenta banco por id + su saldo firme, mapeada a BankAccountRow.
   * Guard NotFound + verificación type='banco' (T-150-04): no expone ni permite
   * mutar cajas efectivo por este camino. `balance` = firmeBalance de getBalance,
   * NUNCA sumado con pendienteAmount (CAJA-03).
   *
   * @throws NotFoundError cuando no existe o no es una caja type='banco'.
   */
  private async getBankAccountRow(
    ctx: TenantContext,
    id: number,
  ): Promise<BankAccountRow> {
    const [caja] = await this.db
      .select({
        id: schema.cashRegisters.id,
        name: schema.cashRegisters.name,
        type: schema.cashRegisters.type,
        currency: schema.cashRegisters.currency,
        isActive: schema.cashRegisters.isActive,
        bankName: schema.cashRegisters.bankName,
        accountHolder: schema.cashRegisters.accountHolder,
        taxId: schema.cashRegisters.taxId,
        cbuCvu: schema.cashRegisters.cbuCvu,
        accountAlias: schema.cashRegisters.accountAlias,
        accountNumber: schema.cashRegisters.accountNumber,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, id),
        ),
      )
      .limit(1);
    if (!caja || caja.type !== "banco") {
      throw new NotFoundError(`No existe la cuenta banco ${id}`);
    }
    const bal = await this.getBalance(ctx, id);
    return {
      id: caja.id,
      name: caja.name,
      currency: caja.currency,
      isActive: caja.isActive,
      bankName: caja.bankName,
      accountHolder: caja.accountHolder,
      taxId: caja.taxId,
      cbuCvu: caja.cbuCvu,
      accountAlias: caja.accountAlias,
      accountNumber: caja.accountNumber,
      balance: bal.firmeBalance,
    };
  }

  /**
   * Crea una cuenta banco (CTA-01). INSERT con type='banco', branchId=null,
   * openingBalance=0, cutoffDate=hoy y `name` derivado del banco (D-05). Valida
   * la regla uno-de-dos ANTES de escribir (D-02). La moneda se fija acá y no se
   * puede cambiar después (D-04). Devuelve la fila con balance = saldo firme.
   *
   * @throws BadRequestError cuando faltan CBU/CVU y Alias (regla uno-de-dos).
   */
  async createBankAccount(
    ctx: TenantContext,
    input: CreateBankAccountInput,
  ): Promise<BankAccountRow> {
    const bankName = input.bankName.trim();
    const accountHolder = input.accountHolder.trim();
    const cbuCvu = input.cbuCvu?.trim() || null;
    const accountAlias = input.accountAlias?.trim() || null;
    const taxId = input.taxId?.trim() || null;
    const accountNumber = input.accountNumber?.trim() || null;

    this.assertTransferIdentifier(cbuCvu, accountAlias);

    const name = this.deriveBankAccountName(
      bankName,
      accountAlias,
      cbuCvu,
      accountNumber,
    );

    // `tenantValues` va por fuera del literal (no dentro): el gimnasio se
    // estampa DESPUÉS del spread, así que ningún campo del input puede pisarlo.
    // Los enums de Drizzle (`type: "banco"`) compilan igual — no hace falta
    // `as const` (hallazgo 169-07).
    const inserted = await this.db.insert(schema.cashRegisters).values(
      tenantValues(ctx, {
        name,
        type: "banco",
        branchId: null,
        currency: input.currency,
        bankName,
        accountHolder,
        taxId,
        cbuCvu,
        accountAlias,
        accountNumber,
        openingBalance: 0,
        cutoffDate: this.today(),
      }),
    );
    const id = Number(inserted[0].insertId);
    this.log.info(
      { cashRegisterId: id, currency: input.currency, tenantId: ctx.tenantId },
      "Cuenta banco creada",
    );
    return this.getBankAccountRow(ctx, id);
  }

  /**
   * Crea una caja de EFECTIVO de sucursal (UAT caja/cobros 2026-07-21: "te deja
   * crear nuevas cuentas bancarias, pero no nuevas cajas"). Hasta ahora las
   * cajas efectivo solo nacían por migración (0154), así que abrir una sucursal
   * requería un deploy.
   *
   * INVARIANTE (D-01): una sola caja efectivo ACTIVA por (sucursal, moneda). Es
   * lo que mantiene determinista a `resolveCashRegister`, que resuelve la caja
   * de TODO cobro en efectivo con un `.limit(1)` sin ORDER BY: con dos cajas
   * activas de la misma sede la elección sería arbitraria y la plata caería en
   * una caja u otra según el plan de ejecución de MySQL. Por eso el conflicto se
   * rechaza acá y el resolver queda intacto. Una caja CERRADA (is_active=false)
   * no bloquea: reabrir una sede tras cerrarla es legítimo.
   *
   * `cutoffDate` = hoy y `openingBalance` = el arqueo inicial declarado: el saldo
   * es `openingBalance + Σ validados desde el cutoff`, así que arrancar en la
   * fecha de creación evita arrastrar históricos de otra caja.
   *
   * @throws NotFoundError cuando la sucursal no existe.
   * @throws BadRequestError cuando la sucursal está inactiva o el saldo es negativo.
   * @throws ConflictError cuando esa sucursal ya tiene caja efectivo activa en esa moneda.
   */
  async createEfectivoCaja(
    ctx: TenantContext,
    input: {
      branchId: number;
      currency: string;
      openingBalance?: number;
    },
  ): Promise<CajaSaldoRow> {
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        isActive: schema.branches.isActive,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, input.branchId),
        ),
      )
      .limit(1);
    if (!branch) {
      throw new NotFoundError(`No existe la sucursal ${input.branchId}`);
    }
    if (!branch.isActive) {
      throw new BadRequestError(
        `La sucursal ${branch.name} está inactiva: no se le puede abrir una caja`,
      );
    }

    const openingBalance = input.openingBalance ?? 0;
    if (openingBalance < 0) {
      throw new BadRequestError("El saldo inicial no puede ser negativo");
    }

    // El invariante "una caja efectivo activa por (sucursal, moneda)" es POR
    // GIMNASIO: sin este filtro, la caja de otro gimnasio en la misma sucursal
    // bloquearía el alta con un 409 que además delata su existencia. Hasta la
    // fase 172 este SELECT era el contraejemplo canónico de "el método tiene ctx
    // en la firma pero NO está migrado" (riesgo 3 del PATTERNS).
    const [existing] = await this.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, input.branchId),
          eq(schema.cashRegisters.currency, input.currency),
          eq(schema.cashRegisters.isActive, true),
        ),
      )
      .limit(1);
    if (existing) {
      throw new ConflictError(
        `${branch.name} ya tiene una caja de efectivo en ${input.currency}`,
      );
    }

    const name = `Efectivo ${branch.name}`;
    const inserted = await this.db.insert(schema.cashRegisters).values(
      tenantValues(ctx, {
        name,
        type: "efectivo",
        branchId: input.branchId,
        currency: input.currency,
        openingBalance,
        cutoffDate: this.today(),
      }),
    );
    const id = Number(inserted[0].insertId);
    this.log.info(
      {
        cashRegisterId: id,
        branchId: input.branchId,
        currency: input.currency,
        openingBalance,
      },
      "Caja efectivo creada",
    );

    const bal = await this.getBalance(ctx, id);
    return {
      cashRegisterId: id,
      name,
      type: "efectivo",
      branchId: input.branchId,
      currency: input.currency,
      firmeBalance: bal.firmeBalance,
      pendienteAmount: bal.pendienteAmount,
      period: null,
    };
  }

  /**
   * Edita una cuenta banco (CTA-01). Mergea SOLO los campos bancarios provistos
   * sobre el estado actual, recalcula el `name` (D-03) y revalida la regla
   * uno-de-dos sobre el resultado (D-02). La moneda NUNCA entra al SET —
   * defensa en profundidad además del schema (moneda fija post-creación, D-04 /
   * T-150-17). Guard NotFound + type='banco' (T-150-04).
   *
   * @throws NotFoundError cuando no existe o no es type='banco'.
   * @throws BadRequestError cuando el estado resultante no tiene CBU/CVU ni Alias.
   */
  async updateBankAccount(
    ctx: TenantContext,
    id: number,
    input: UpdateBankAccountInput,
  ): Promise<BankAccountRow> {
    const current = await this.getBankAccountRow(ctx, id);

    const bankName =
      input.bankName !== undefined
        ? input.bankName.trim()
        : (current.bankName ?? "");
    const accountHolder =
      input.accountHolder !== undefined
        ? input.accountHolder.trim()
        : (current.accountHolder ?? "");
    const cbuCvu =
      input.cbuCvu !== undefined
        ? input.cbuCvu?.trim() || null
        : current.cbuCvu;
    const accountAlias =
      input.accountAlias !== undefined
        ? input.accountAlias?.trim() || null
        : current.accountAlias;
    const taxId =
      input.taxId !== undefined ? input.taxId?.trim() || null : current.taxId;
    const accountNumber =
      input.accountNumber !== undefined
        ? input.accountNumber?.trim() || null
        : current.accountNumber;

    this.assertTransferIdentifier(cbuCvu, accountAlias);

    const name = this.deriveBankAccountName(
      bankName,
      accountAlias,
      cbuCvu,
      accountNumber,
    );

    // NOTA: `currency` NO figura en este SET a propósito (D-04 / T-150-17).
    await this.db
      .update(schema.cashRegisters)
      .set({
        name,
        bankName,
        accountHolder,
        taxId,
        cbuCvu,
        accountAlias,
        accountNumber,
      })
      // El SELECT previo ya cortó con 404 si la cuenta es de otro gimnasio; el
      // filtro va igual en el UPDATE (T-172-06-02: el WHERE de una escritura no
      // se apoya en una lectura anterior).
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, id),
        ),
      );

    this.log.info({ cashRegisterId: id }, "Cuenta banco actualizada");
    return this.getBankAccountRow(ctx, id);
  }

  /**
   * Baja lógica de una cuenta banco (CTA-02 / D-06): set is_active=false, sin
   * DELETE — conserva el historial. El service NO bloquea el cierre con saldo≠0;
   * devuelve el saldo FIRME actual (firmeBalance, NUNCA sumado con pendiente —
   * CAJA-03) para que el front arme la advertencia. Guard NotFound + type='banco'.
   *
   * @throws NotFoundError cuando no existe o no es type='banco'.
   */
  async closeBankAccount(
    ctx: TenantContext,
    id: number,
  ): Promise<{ balance: number }> {
    const row = await this.getBankAccountRow(ctx, id);
    await this.db
      .update(schema.cashRegisters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, id),
        ),
      );
    this.log.info({ cashRegisterId: id }, "Cuenta banco cerrada (baja lógica)");
    return { balance: row.balance };
  }

  /**
   * Reactiva una cuenta banco cerrada (CTA-02 / D-07): set is_active=true. Guard
   * NotFound + type='banco'. Devuelve la fila con su saldo firme.
   *
   * @throws NotFoundError cuando no existe o no es type='banco'.
   */
  async reactivateBankAccount(
    ctx: TenantContext,
    id: number,
  ): Promise<BankAccountRow> {
    await this.getBankAccountRow(ctx, id);
    await this.db
      .update(schema.cashRegisters)
      .set({ isActive: true })
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.id, id),
        ),
      );
    this.log.info({ cashRegisterId: id }, "Cuenta banco reactivada");
    return this.getBankAccountRow(ctx, id);
  }

  /**
   * Lista TODAS las cuentas banco (CTA-01 / D-07): activas Y cerradas (NO filtra
   * por is_active), cada una con su saldo firme (balance = firmeBalance, NUNCA
   * sumado con pendiente — CAJA-03). Compone getBalance por caja (patrón de
   * listActiveCajasWithBalance; a escala de un puñado de cuentas, sin N+1 real).
   */
  async listBankAccounts(ctx: TenantContext): Promise<BankAccountRow[]> {
    const cajas = await this.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.type, "banco"),
        ),
      )
      .orderBy(asc(schema.cashRegisters.id));
    const out: BankAccountRow[] = [];
    for (const c of cajas) {
      out.push(await this.getBankAccountRow(ctx, c.id));
    }
    return out;
  }
}
