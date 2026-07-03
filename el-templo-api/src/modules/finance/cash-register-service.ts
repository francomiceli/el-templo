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

import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { firmMoneyConditions } from "./firm-money";
import type {
  BankAccountRow,
  CajaSaldoRow,
  CashRegisterBalance,
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
   *   - transfer / card        → banco caja of `currency` (resolved BY currency,
   *                              so a currency mismatch is structurally
   *                              impossible — no guard needed).
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
    paymentMethod: PaymentMethod,
    branchId: number | null,
    currency: string,
  ): Promise<number | null> {
    if (paymentMethod === "aura_credit" || paymentMethod === "internal") {
      return null;
    }

    if (paymentMethod === "transfer" || paymentMethod === "card") {
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
  async getBalance(cashRegisterId: number): Promise<CashRegisterBalance> {
    const [caja] = await this.db
      .select({
        openingBalance: schema.cashRegisters.openingBalance,
        currency: schema.cashRegisters.currency,
        cutoffDate: schema.cashRegisters.cutoffDate,
      })
      .from(schema.cashRegisters)
      .where(eq(schema.cashRegisters.id, cashRegisterId))
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
  async listActiveCajasWithBalance(scope?: {
    isOwner: boolean;
    country: string | null;
  }): Promise<CajaSaldoRow[]> {
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
        eq(schema.branches.id, schema.cashRegisters.branchId),
      )
      .where(eq(schema.cashRegisters.isActive, true));

    const out: CajaSaldoRow[] = [];
    for (const c of cajas) {
      // Non-owner scope: branch-less cajas (central/banco) are owner-only, and
      // a branch-scoped caja is visible only when its country matches.
      if (scope && !scope.isOwner) {
        if (c.branchId === null) continue; // central/banco → owner-only
        if (c.branchCountry !== scope.country) continue; // cross-country → hide
      }
      const bal = await this.getBalance(c.id);
      out.push({
        cashRegisterId: c.id,
        name: c.name,
        type: c.type,
        branchId: c.branchId,
        currency: c.currency,
        firmeBalance: bal.firmeBalance,
        pendienteAmount: bal.pendienteAmount,
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
    country: string | null,
  ): Promise<CostCenterItem[]> {
    const conditions = [eq(schema.costCenters.isActive, true)];
    if (country !== null) {
      conditions.push(eq(schema.costCenters.country, country));
    }
    return this.db
      .select({
        id: schema.costCenters.id,
        name: schema.costCenters.name,
        country: schema.costCenters.country,
      })
      .from(schema.costCenters)
      .where(and(...conditions))
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
  private async getBankAccountRow(id: number): Promise<BankAccountRow> {
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
      .where(eq(schema.cashRegisters.id, id))
      .limit(1);
    if (!caja || caja.type !== "banco") {
      throw new NotFoundError(`No existe la cuenta banco ${id}`);
    }
    const bal = await this.getBalance(id);
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

    const inserted = await this.db.insert(schema.cashRegisters).values({
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
    });
    const id = Number(inserted[0].insertId);
    this.log.info(
      { cashRegisterId: id, currency: input.currency },
      "Cuenta banco creada",
    );
    return this.getBankAccountRow(id);
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
    id: number,
    input: UpdateBankAccountInput,
  ): Promise<BankAccountRow> {
    const current = await this.getBankAccountRow(id);

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
      .where(eq(schema.cashRegisters.id, id));

    this.log.info({ cashRegisterId: id }, "Cuenta banco actualizada");
    return this.getBankAccountRow(id);
  }

  /**
   * Baja lógica de una cuenta banco (CTA-02 / D-06): set is_active=false, sin
   * DELETE — conserva el historial. El service NO bloquea el cierre con saldo≠0;
   * devuelve el saldo FIRME actual (firmeBalance, NUNCA sumado con pendiente —
   * CAJA-03) para que el front arme la advertencia. Guard NotFound + type='banco'.
   *
   * @throws NotFoundError cuando no existe o no es type='banco'.
   */
  async closeBankAccount(id: number): Promise<{ balance: number }> {
    const row = await this.getBankAccountRow(id);
    await this.db
      .update(schema.cashRegisters)
      .set({ isActive: false })
      .where(eq(schema.cashRegisters.id, id));
    this.log.info({ cashRegisterId: id }, "Cuenta banco cerrada (baja lógica)");
    return { balance: row.balance };
  }

  /**
   * Reactiva una cuenta banco cerrada (CTA-02 / D-07): set is_active=true. Guard
   * NotFound + type='banco'. Devuelve la fila con su saldo firme.
   *
   * @throws NotFoundError cuando no existe o no es type='banco'.
   */
  async reactivateBankAccount(id: number): Promise<BankAccountRow> {
    await this.getBankAccountRow(id);
    await this.db
      .update(schema.cashRegisters)
      .set({ isActive: true })
      .where(eq(schema.cashRegisters.id, id));
    this.log.info({ cashRegisterId: id }, "Cuenta banco reactivada");
    return this.getBankAccountRow(id);
  }

  /**
   * Lista TODAS las cuentas banco (CTA-01 / D-07): activas Y cerradas (NO filtra
   * por is_active), cada una con su saldo firme (balance = firmeBalance, NUNCA
   * sumado con pendiente — CAJA-03). Compone getBalance por caja (patrón de
   * listActiveCajasWithBalance; a escala de un puñado de cuentas, sin N+1 real).
   */
  async listBankAccounts(): Promise<BankAccountRow[]> {
    const cajas = await this.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(eq(schema.cashRegisters.type, "banco"))
      .orderBy(asc(schema.cashRegisters.id));
    const out: BankAccountRow[] = [];
    for (const c of cajas) {
      out.push(await this.getBankAccountRow(c.id));
    }
    return out;
  }
}
