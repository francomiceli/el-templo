/**
 * Fase 172 Plan 17 (ISO-03) — las FINANZAS del segundo gimnasio, sembrables en
 * una llamada, y la evidencia leída de la BASE.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * `test/fixtures/second-tenant.ts` (plan 171-04) siembra el ESQUELETO del
 * gimnasio 2 —sede, actividad, plan, horario, staff y socios— y a proposito no
 * siembra nada de finance: D-06 no lo pedia. La bateria ISO-03 (planes 172-17,
 * 172-18 y 172-19) necesita, en cambio, un gimnasio 2 con plata adentro: una
 * caja, un centro de costo, una cuenta banco, una transaccion con su link y su
 * fila de `balances`. Sin eso, un caso de aislamiento no tiene control
 * positivo, y sin control positivo un 404 por siembra rota pasa como
 * aislamiento (D-08).
 *
 * Este archivo es ese complemento, hecho una vez y compartido por los tres
 * planes de la bateria.
 *
 * EL ORDEN ES OBLIGADO, NO COSMETICO
 * -----------------------------------
 * ```ts
 * beforeEach(async () => {
 *   await cleanAllTestData(app);                   // 1. vacia ~90 tablas SIN filtro de gimnasio
 *   await limpiarFinanzasDeLaBateria(app);         // 2. ANTES de seedSecondTenant (ver abajo)
 *   gym2 = await seedSecondTenant(app);            // 3. el esqueleto del gimnasio 2
 *   templo = await sembrarFinanzasTemplo(app);     // 4. el recurso ajeno (gimnasio 1)
 *   finanzas = await sembrarFinanzasGimnasioDos(app, gym2); // 5. lo propio del gimnasio 2
 * });
 *
 * afterAll(async () => {
 *   await cleanAllTestData(app);
 *   await limpiarFinanzasDeLaBateria(app);
 *   await limpiarSegundoGimnasio(app);
 *   await app.close();
 * });
 * ```
 *
 * `cleanAllTestData` va PRIMERO: borra todos los users menos `admin@test.com` y
 * vacia `financial_transactions`, `transaction_links` y `balances` sin filtro
 * de gimnasio. Sembrar antes de limpiar deja las finanzas a medias.
 * `sembrarFinanzasGimnasioDos` va DESPUES de `seedSecondTenant` porque necesita
 * la sede, el admin y los socios que aquel crea.
 *
 * **`limpiarFinanzasDeLaBateria` va ANTES de `seedSecondTenant`, y NO es un
 * gusto** (rojo real, encontrado corriendo el fixture contra MySQL):
 * `seedSecondTenant` arranca llamando a `limpiarSegundoGimnasio`, que termina
 * con `DELETE FROM tenants WHERE id = 90671`. `cost_centers.tenant_id` tiene FK
 * a `tenants` (`fk_cost_centers_tenant`) y `limpiarSegundoGimnasio` NO borra
 * `cost_centers`: con un centro de costo del gimnasio 2 vivo del test anterior,
 * ese DELETE revienta con `ER_ROW_IS_REFERENCED_2` y el `beforeEach` entero se
 * cae. Es la MISMA trampa que el 169-06 documento para `branches`, por otra
 * tabla. Llamarla despues no sirve: para entonces el `beforeEach` ya murio.
 *
 * QUE LIMPIA QUIEN (y por que hace falta `limpiarFinanzasDeLaBateria`)
 * -------------------------------------------------------------------
 *   - `cleanAllTestData` vacia `financial_transactions`, `transaction_links` y
 *     `balances` en cada `beforeEach`. Esas tres NO necesitan limpieza extra.
 *   - `limpiarSegundoGimnasio` ya borra `cash_registers` del gimnasio 2 (en su
 *     orden de FKs, antes de `branches`), asi que la caja que crea
 *     `ensureEfectivoCaja` de aca abajo tampoco necesita limpieza extra.
 *   - `cost_centers` NO esta en `TABLES_TO_CLEAN` (viene seedeada por las
 *     migraciones 0161/0163/0165) y `limpiarSegundoGimnasio` NO la toca; las
 *     cuentas banco de `cash_registers` del gimnasio 1 tampoco las limpia
 *     nadie. Con `isolate: false` esas filas sobreviven al archivo y se filtran
 *     al siguiente del mismo worker (Pitfall 10). Por eso existe
 *     {@link limpiarFinanzasDeLaBateria}, que borra exactamente lo que este
 *     fixture sembro: TODO lo del gimnasio 2 y, del gimnasio 1, solo lo
 *     marcado con {@link MARCA_ISO03}.
 *
 * IDS DE GIMNASIO
 * ---------------
 * Solo dos, los que ya existen: `TENANT_DOS` (90671) y `TENANT_TEMPLO` (1). Este
 * archivo NO inventa gimnasios nuevos.
 *
 * PORQUE NINGUN INSERT SE OLVIDA DE `tenantValues`
 * ------------------------------------------------
 * `tenant_id` tiene DEFAULT 1 desde la fase 167: un INSERT que omita la columna
 * siembra en El Templo sin avisar y el fixture MIENTE (T-168-15). El caso de
 * aislamiento que lo use pasaria en verde probando exactamente nada. Todo INSERT
 * de aca pasa por `tenantValues(ctx, ...)`, y {@link tenantDeLaFila} existe
 * justamente para que los tests puedan no creerle a este archivo.
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md (lo escribe el plan 172-23)
 */
import { and, eq, like, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { ensureEfectivoCaja } from "../helpers";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "./second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Contexto de escritura del gimnasio 2. */
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Contexto de escritura de El Templo. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

/**
 * Prefijo de nombre de TODA fila que este fixture crea en tablas que nadie
 * limpia (`cost_centers` y las cuentas banco de `cash_registers`).
 *
 * Es lo que le permite a {@link limpiarFinanzasDeLaBateria} borrar lo propio sin
 * tocar los centros de costo que sembraron las migraciones 0161/0163/0165 ni las
 * cajas "Banco ARS" / "Banco EUR" / "Efectivo <sede>" que siembra
 * `test/setup.ts` — de las que dependen decenas de archivos del mismo worker.
 */
export const MARCA_ISO03 = "ISO03";

/**
 * El unico usuario que sobrevive a `cleanAllTestData`
 * (`DELETE FROM users WHERE NOT (email <=> 'admin@test.com')`).
 *
 * Se resuelve POR EMAIL y nunca por id: la base de CI no tiene el id 1 en
 * `users` y un literal ahi es un rojo que solo aparece en CI.
 */
const EMAIL_ADMIN_SEMILLA = "admin@test.com";

/** Moneda de todo lo que siembra este fixture. Las dos sedes son AR. */
const MONEDA = "ARS";

/** Fecha fija de las transacciones sembradas: posterior a todo `cutoff_date`. */
const FECHA = "2026-01-15";

/** Importe de la transaccion sembrada, en la unidad minima del ledger. */
const IMPORTE = 12345;

// ─── Forma de los handles ────────────────────────────────────────────────────

/** Las finanzas del gimnasio 2, con los ids listos para usar como "lo propio". */
export interface FinanzasDelGimnasioDos {
  /** Caja de EFECTIVO de la sede del gimnasio 2 (`ensureEfectivoCaja`). */
  cajaId: number;
  /** Cuenta banco (`cash_registers.type = 'banco'`, sin sede). */
  bankAccountId: number;
  costCenterId: number;
  transactionId: number;
  linkId: number;
  balanceId: number;
  /** Nombre del centro de costo, para las aserciones de listado. */
  costCenterName: string;
  /** Nombre de la cuenta banco, para las aserciones de listado. */
  bankAccountName: string;
}

/**
 * Los recursos EQUIVALENTES de El Templo: lo que el staff del gimnasio 2 no
 * tiene que poder ver ni tocar.
 */
export interface FinanzasDeElTemplo {
  /** Sede real de El Templo (resuelta, nunca un `1` magico). */
  branchId: number;
  /** Caja de efectivo de esa sede — la siembra `test/setup.ts`. */
  cajaId: number;
  /** Cuenta banco creada por este fixture (marcada). */
  bankAccountId: number;
  /** Centro de costo creado por este fixture (marcado). */
  costCenterId: number;
  transactionId: number;
  linkId: number;
  balanceId: number;
  costCenterName: string;
  bankAccountName: string;
}

// ─── Evidencia leida de la BASE ──────────────────────────────────────────────

/**
 * Las 6 tablas de `TENANT_STRICT_MODULES.finance` (D-05 del CONTEXT).
 *
 * Union CERRADA de literales a proposito: {@link tenantDeLaFila} interpola el
 * nombre con `sql.raw` porque un identificador no se puede parametrizar, y un
 * `string` libre ahi seria una puerta abierta a construir SQL desde datos. `tsc`
 * rechaza cualquier otra cosa. Mismo molde que `TablaDelEspejo` de
 * `iso-02-fixtures.test.ts` y `TablaInspeccionada` de `con-03`.
 */
export type TablaStrict =
  | "financial_transactions"
  | "transaction_links"
  | "balances"
  | "cash_registers"
  | "cost_centers"
  | "debt_management";

/**
 * Columnas que {@link campoDeLaFila} sabe leer. Union cerrada por el mismo
 * motivo que {@link TablaStrict}: el segundo `sql.raw` del archivo.
 */
export type ColumnaInspeccionable = "name" | "is_active" | "currency";

/**
 * Normaliza la salida de `app.db.execute`, que devuelve `[filas, metadata]` en
 * mysql2 y a veces las filas peladas. Los precedentes del repo la normalizan
 * igual (`iso-02-fixtures.test.ts`, `con-03-write-paths-tenant-id.test.ts`).
 */
async function consultar<T>(app: FastifyInstance, consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/**
 * El `tenant_id` REAL de una fila, leido de la base por id. Devuelve `null`
 * cuando la fila no existe, para que un id equivocado se distinga de un gimnasio
 * equivocado en el mensaje del rojo.
 *
 * ESTA ES LA UNICA EVIDENCIA QUE VALE en la bateria ISO-03. Un status HTTP dice
 * lo que la ruta contesto; esto dice que quedo ESCRITO. Las dos cosas se miran
 * juntas: un 404 con la fila ajena mutada seria un aislamiento aparente.
 *
 * Fase 172: las 6 tablas de la union son strict, asi que este SELECT hace throw
 * sin anotacion. La exencion `tenant-safe:` va EMBEBIDA en el SQL (unico canal
 * que el sentinel lee) y es la salida CORRECTA, no un escape: filtrar por
 * `tenant_id` aca volveria la asercion TAUTOLOGICA — la pregunta es "¿en que
 * gimnasio nacio esta fila?" y una query que ya asume la respuesta no prueba
 * nada. Mismo razonamiento y misma redaccion que `con-03` (decision 2 del
 * 172-16).
 */
export async function tenantDeLaFila(
  app: FastifyInstance,
  tabla: TablaStrict,
  id: number,
): Promise<number | null> {
  const filas = await consultar<{ t: number | null }>(
    app,
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila ES la asercion; filtrar por el la volveria tautologica */ tenant_id AS t FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].t === null) return null;
  return Number(filas[0].t);
}

/**
 * El valor REAL de una columna de una fila, leido de la base por id. Devuelve
 * `null` cuando la fila no existe.
 *
 * Es la evidencia de TAMPERING (T-172-17-02): despues de un intento de
 * escritura cross-tenant no alcanza con mirar el 404 — hay que releer el campo
 * que se intento cambiar y compararlo contra su valor original. Un handler que
 * mute y despues 404ee daria verde con la mitad de la evidencia.
 *
 * Misma exencion y mismo motivo que {@link tenantDeLaFila}: el punto es leer la
 * fila ajena SIN filtrarla por gimnasio, porque justamente lo que se afirma es
 * que sigue siendo del otro gimnasio y sigue intacta.
 */
export async function campoDeLaFila(
  app: FastifyInstance,
  tabla: TablaStrict,
  columna: ColumnaInspeccionable,
  id: number,
): Promise<string | null> {
  const filas = await consultar<{ v: unknown }>(
    app,
    sql`SELECT /* tenant-safe: releer la fila AJENA es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ ${sql.raw(columna)} AS v FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].v === null) return null;
  return String(filas[0].v);
}

// ─── Siembra ─────────────────────────────────────────────────────────────────

/** Sufijo unico por corrida, mismo generador que `second-tenant.ts`. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Id del admin semilla, resuelto POR EMAIL.
 *
 * `financial_transactions.recorded_by` es NOT NULL con FK a `users`, y despues
 * de `cleanAllTestData` el unico usuario de El Templo que queda es este. Nunca
 * se hardcodea el id: la base de CI no tiene el mismo que la local.
 */
async function adminSemillaId(app: FastifyInstance): Promise<number> {
  const [fila] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, EMAIL_ADMIN_SEMILLA))
    .limit(1);
  if (!fila) {
    throw new Error(
      `sembrarFinanzasTemplo: no existe ${EMAIL_ADMIN_SEMILLA}. Ese usuario lo siembra ` +
        `test/setup.ts y es el unico que sobrevive a cleanAllTestData: sin el no hay ` +
        `\`recorded_by\` valido para la transaccion de El Templo.`,
    );
  }
  return fila.id;
}

/**
 * Siembra las finanzas de El Templo que la bateria usa como RECURSO AJENO.
 *
 * NO limpia: la limpieza es {@link limpiarFinanzasDeLaBateria} y tiene que
 * correr ANTES de `seedSecondTenant` (ver el docblock del archivo — la FK
 * `fk_cost_centers_tenant`). Los nombres llevan sufijo unico por corrida, asi
 * que aunque quedara una fila colgada no chocaria con la unique
 * `uq_cost_centers_tenant_name_country`.
 *
 * La sede se RESUELVE (primera sede no virtual de El Templo) en vez de asumir
 * `branchId: 1`: el id depende del orden de las migraciones y del seed, y un
 * literal aca es un rojo que solo aparece en la base de otro.
 */
export async function sembrarFinanzasTemplo(
  app: FastifyInstance,
): Promise<FinanzasDeElTemplo> {
  const suf = sufijo();
  const recordedBy = await adminSemillaId(app);

  const [sede] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, CTX_TEMPLO),
        eq(schema.branches.isVirtual, false),
      ),
    )
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      "sembrarFinanzasTemplo: El Templo no tiene ninguna sede no virtual. " +
        "Las siembra test/setup.ts (codigos TEST/ONLINE) — revisar ese archivo.",
    );
  }

  // La caja de efectivo de esa sede ya la siembra `test/setup.ts` para TODAS
  // las sedes que existen al arrancar el worker: aca se RESUELVE, no se crea.
  // Crearla otra vez con `ensureEfectivoCaja` seria inocuo (es idempotente) pero
  // taparia el rojo del dia que ese seed deje de correr, y este fixture depende
  // de el.
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, CTX_TEMPLO),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, sede.id),
      ),
    )
    .limit(1);
  if (!caja) {
    throw new Error(
      `sembrarFinanzasTemplo: la sede ${sede.id} de El Templo no tiene caja efectivo. ` +
        `La siembra test/setup.ts (una por sede, post-migraciones): revisar ese archivo ` +
        `antes de tocar este fixture.`,
    );
  }

  const bankAccountName = `${MARCA_ISO03} Banco Templo ${suf}`;
  const [banco] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: bankAccountName,
        type: "banco",
        branchId: null,
        currency: MONEDA,
        bankName: "Banco del Templo",
        accountHolder: "El Templo",
        accountAlias: `${MARCA_ISO03.toLowerCase()}.templo.${suf}`,
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();

  const costCenterName = `${MARCA_ISO03} Centro Templo ${suf}`;
  const [centro] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX_TEMPLO, { name: costCenterName, country: "AR" }))
    .$returningId();

  const { transactionId, linkId, balanceId } = await sembrarElAsiento(app, {
    ctx: CTX_TEMPLO,
    memberId: recordedBy,
    recordedBy,
    branchId: sede.id,
    cashRegisterId: caja.id,
  });

  return {
    branchId: sede.id,
    cajaId: caja.id,
    bankAccountId: banco.id,
    costCenterId: centro.id,
    transactionId,
    linkId,
    balanceId,
    costCenterName,
    bankAccountName,
  };
}

/**
 * Siembra las finanzas del gimnasio 2: caja de efectivo de su sede, cuenta
 * banco, centro de costo y una transaccion con su link y su fila de `balances`.
 *
 * Va SIEMPRE despues de `seedSecondTenant` (necesita `gym2.branchId`,
 * `gym2.adminId` y `gym2.socios`) y despues de `sembrarFinanzasTemplo` (que es
 * la que borra el rastro de la corrida anterior).
 */
export async function sembrarFinanzasGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<FinanzasDelGimnasioDos> {
  const suf = sufijo();

  // El 4o argumento NO es opcional en la practica: su default es 1, asi que
  // omitirlo estampa la caja en El Templo (T-168-15) y el fixture mentiria.
  await ensureEfectivoCaja(app, gym2.branchId, MONEDA, TENANT_DOS);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, CTX_DOS),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, gym2.branchId),
      ),
    )
    .limit(1);
  if (!caja) {
    throw new Error(
      `sembrarFinanzasGimnasioDos: la sede ${gym2.branchId} quedo sin caja efectivo en el ` +
        `gimnasio ${TENANT_DOS}. Si la caja aparece en El Templo, a la llamada de ` +
        `ensureEfectivoCaja le falto el 4o argumento.`,
    );
  }

  const bankAccountName = `${MARCA_ISO03} Banco G2 ${suf}`;
  const [banco] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(CTX_DOS, {
        name: bankAccountName,
        type: "banco",
        branchId: null,
        currency: MONEDA,
        bankName: "Banco del Gimnasio Dos",
        accountHolder: "Gimnasio Dos",
        accountAlias: `${MARCA_ISO03.toLowerCase()}.g2.${suf}`,
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();

  const costCenterName = `${MARCA_ISO03} Centro G2 ${suf}`;
  const [centro] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX_DOS, { name: costCenterName, country: "AR" }))
    .$returningId();

  const { transactionId, linkId, balanceId } = await sembrarElAsiento(app, {
    ctx: CTX_DOS,
    memberId: gym2.socios[0].id,
    recordedBy: gym2.adminId,
    branchId: gym2.branchId,
    cashRegisterId: caja.id,
  });

  return {
    cajaId: caja.id,
    bankAccountId: banco.id,
    costCenterId: centro.id,
    transactionId,
    linkId,
    balanceId,
    costCenterName,
    bankAccountName,
  };
}

/**
 * El asiento minimo del ledger: una transaccion VALIDADA (plata firme, la que
 * mueve el saldo de la caja), su `transaction_links` y su fila de `balances`.
 *
 * Se escribe a mano y no via `TransactionService.create` a proposito: el fixture
 * de una bateria de aislamiento no puede depender del mismo camino de escritura
 * que la bateria esta poniendo a prueba. Los valores son los de un cobro real
 * (`kind: 'plan_charge'`, `direction: 'inflow'`, `validationStatus: 'validado'`)
 * para que `getBalance` lo cuente como firme.
 */
async function sembrarElAsiento(
  app: FastifyInstance,
  datos: {
    ctx: TenantContext;
    memberId: number;
    recordedBy: number;
    branchId: number;
    cashRegisterId: number;
  },
): Promise<{ transactionId: number; linkId: number; balanceId: number }> {
  const [tx] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(datos.ctx, {
        memberId: datos.memberId,
        kind: "plan_charge",
        direction: "inflow",
        amount: IMPORTE,
        currency: MONEDA,
        paymentMethod: "cash",
        transactionDate: FECHA,
        effectiveDate: FECHA,
        branchId: datos.branchId,
        cashRegisterId: datos.cashRegisterId,
        recordedBy: datos.recordedBy,
        validationStatus: "validado",
      }),
    )
    .$returningId();

  const [link] = await app.db
    .insert(schema.transactionLinks)
    .values(
      tenantValues(datos.ctx, {
        transactionId: tx.id,
        targetKind: "debt_balance",
        targetId: 0,
        allocatedAmount: IMPORTE,
      }),
    )
    .$returningId();

  const [balance] = await app.db
    .insert(schema.balances)
    .values(
      tenantValues(datos.ctx, {
        memberId: datos.memberId,
        targetKind: "debt_balance",
        targetId: 0,
        currency: MONEDA,
        amount: IMPORTE,
      }),
    )
    .$returningId();

  return { transactionId: tx.id, linkId: link.id, balanceId: balance.id };
}

// ─── Limpieza ────────────────────────────────────────────────────────────────

/**
 * Borra lo que este fixture (y las rutas que la bateria ejercita) dejan en las
 * dos tablas que NADIE limpia entre archivos: `cost_centers` y las cuentas banco
 * de `cash_registers`.
 *
 * DOS BARRIDOS Y NINGUNA EXENCION:
 *   1. TODO lo del gimnasio 2 — filtrado por `tenant_id`, asi que ademas de
 *      correcto es sentinel-safe. Incluye lo que crean las rutas de alta de la
 *      bateria (`POST /cost-centers`, `POST /cash-registers`,
 *      `POST /cash-registers/efectivo`), que nace con nombre elegido por el
 *      service y por lo tanto SIN la marca.
 *   2. De El Templo, SOLO lo marcado con {@link MARCA_ISO03} — tambien filtrado
 *      por `tenant_id`. Borrar de mas aca seria peor que no borrar: los centros
 *      de costo de las migraciones 0161/0163/0165 y las cajas de `test/setup.ts`
 *      las usan decenas de archivos del mismo worker.
 *
 * Idempotente. **Corre ANTES de `seedSecondTenant`** (no despues: aquel intenta
 * borrar la fila de `tenants` del gimnasio 2 y un centro de costo suyo vivo se
 * lo impide por FK — ver el docblock del archivo) y otra vez en el `afterAll`.
 * Va DESPUES de `cleanAllTestData`: `financial_transactions` tiene FK a
 * `cash_registers` y aca los FK checks estan encendidos.
 */
export async function limpiarFinanzasDeLaBateria(
  app: FastifyInstance,
): Promise<void> {
  await app.db
    .delete(schema.costCenters)
    .where(tenantWhere(schema.costCenters, CTX_DOS));
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, CTX_TEMPLO),
        like(schema.costCenters.name, `${MARCA_ISO03}%`),
      ),
    );
  // Del gimnasio 2 se van TODAS las cajas (las borra igual
  // `limpiarSegundoGimnasio`, pero esta funcion tiene que poder correr sola).
  await app.db
    .delete(schema.cashRegisters)
    .where(tenantWhere(schema.cashRegisters, CTX_DOS));
  // De El Templo, solo las marcadas: la caja "Efectivo <sede>" y las "Banco
  // ARS"/"Banco EUR" de test/setup.ts se quedan donde estan.
  await app.db
    .delete(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, CTX_TEMPLO),
        like(schema.cashRegisters.name, `${MARCA_ISO03}%`),
      ),
    );
}
