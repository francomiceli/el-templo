/**
 * Fase 172 Plan 19 (ISO-03) — AISLAMIENTO del borde MENOS PRIVILEGIADO de
 * finance: las 7 rutas de `/coach-load/*` corridas con el rol COACH, mas las 4
 * que mueven plata entre cajas (movimientos y egresos).
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el TERCERO y ultimo de la bateria ISO-03. El 172-17 cubrio cajas y centros
 * de costo (14 rutas) y el 172-18 el corazon transaccional (13); los dos
 * corrieron con `gym2.adminToken` porque era el rol minimo REAL de sus grupos.
 * D-10 pide el borde menos privilegiado, y ese borde vive aca:
 * `src/modules/finance/coach-load-routes.ts` es el UNICO archivo del modulo con
 * su propio hook `onRequest` gateado por `FINANCE_LOAD_ROLES` — el unico por el
 * que entra un coach. El guard de modulo de `finance/routes.ts`
 * (`FINANCE_READ_ROLES`) lo deja afuera de todo lo demas.
 *
 * La segunda mitad del archivo son las cajas: un movimiento inter-caja o un
 * egreso apuntados a una caja (o a un centro de costo) del otro gimnasio es la
 * corrupcion contable mas directa que existe, porque mueve plata sin pasar por
 * ningun socio.
 *
 * QUE RUTAS CUBRE (las 11 finance del manifiesto que faltaban)
 * -----------------------------------------------------------
 *   GET    /api/admin/finance/coach-load/autocompletar/:userId
 *   GET    /api/admin/finance/coach-load/bank-accounts
 *   GET    /api/admin/finance/coach-load/caja-efectivo
 *   GET    /api/admin/finance/coach-load/mis-cargas
 *   POST   /api/admin/finance/coach-load/alta
 *   POST   /api/admin/finance/coach-load/misc
 *   POST   /api/admin/finance/coach-load/pay-plan
 *   POST   /api/admin/finance/movements
 *   POST   /api/admin/finance/movements/:id/void
 *   POST   /api/admin/finance/expenses
 *   POST   /api/admin/finance/expenses/:id/void
 *
 * Con las 14 del `iso-03-finance-cajas.test.ts` y las 13 del
 * `iso-03-finance-transacciones.test.ts`, la bateria cierra las 38 rutas
 * `tenant-scoped` de finance del manifiesto (14 + 13 + 11).
 *
 * EL CONTRATO QUE SE AFIRMA (D-09, para TODO el milestone)
 * -------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente:
 *   - lectura por id de un recurso ajeno   → "no existe" o payload vacio
 *   - listados                             → sin una sola fila ajena
 *   - escrituras contra un recurso ajeno   → rechazo, y NADA escrito
 *
 * **Nunca un "prohibido".** Ese status filtraria existencia ("existe pero no es
 * tuya") y exigiria la query sin scope que el sentinel prohibe. El criterio de
 * aceptacion del plan es un `grep -c` de la asercion de ese status sobre este
 * archivo dando CERO.
 *
 * ⚠️ Por eso este parrafo describe el codigo en castellano en vez de escribirlo:
 * un gate que busca por substring no distingue codigo de comentario, y explicar
 * en una nota por que NO se usa una marca pone el gate en rojo igual (leccion
 * del 172-16 en `test/setup.ts`, repetida en el 172-17). No lo "aclares"
 * escribiendo el numero.
 *
 * DOS RECHAZOS DE ESTE ARCHIVO NO SON "no existe" SINO "pedido invalido", Y ESTA BIEN
 * -----------------------------------------------------------------------------------
 * `MovementService.loadCaja` y la validacion del centro de costo de
 * `registerExpense` rechazan como BadRequest, no como NotFound: para el service
 * un id que no matchea es un body invalido. Lo que el contrato exige es que el
 * recurso ajeno sea INDISTINGUIBLE del inexistente y que el status no filtre
 * existencia — y eso se cumple: el mensaje es exactamente el mismo que para un
 * id que no existe en ningun gimnasio. Es el mismo precedente que el 172-18
 * dejo escrito para `validate({cashRegisterId})`. Cada caso lo dice en su
 * comentario.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO (D-08)
 * --------------------------------------------------------
 * Un rechazo puede venir del aislamiento o de una siembra rota, y los dos se ven
 * igual desde afuera. Por eso cada `describe` tiene al menos un `it` de
 * aislamiento y uno de control, que hace la MISMA operacion sobre el recurso
 * PROPIO del gimnasio 2 y exige que funcione.
 *
 * LA EVIDENCIA SE LEE DE LA BASE, NO DE LA RESPUESTA HTTP
 * ------------------------------------------------------
 * Un handler que ESCRIBA y despues conteste que no encontro nada daria verde
 * mirando solo el status. Por eso los intentos de escritura ajena cuentan las
 * filas de los DOS gimnasios antes y despues, releen `voided_at` de la fila
 * ajena y comparan los SALDOS de las cajas involucradas.
 *
 * EL ACTOR (D-10)
 * ---------------
 * `gym2.coachToken` (rol `coach`) en las 7 rutas de `/coach-load/*`: es el rol
 * minimo real y el unico que este fixture puede ejercer sobre finance.
 * Las 4 de movimientos y egresos van con `gym2.adminToken` y no por comodidad:
 * viven en `finance/routes.ts`, cuyo hook de modulo exige `FINANCE_READ_ROLES`
 * (coach EXCLUIDO) y cuyos handlers exigen ademas `FINANCE_VOID_ROLES`
 * (owner/admin/gestion). `seedSecondTenant` no crea `gestion` ni `recepcion`, y
 * coach esta fuera de los dos conjuntos: `admin` ES el minimo disponible. Queda
 * escrito en el nombre de cada `describe`.
 *
 * COMO CORRERLO
 * -------------
 * Solo este archivo: mas de uno a la vez revienta el timeout del provisioning de
 * la DB por worker en esta maquina (~100 s por archivo, ver el 172-18).
 *   pnpm exec vitest run test/tenancy/iso-03-finance-coach-load.test.ts --hookTimeout=250000
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md (lo escribe el plan 172-23)
 * @see el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts — la plantilla
 * @see .planning/phases/172-adopci-n-1-piloto-finance/172-CONTEXT.md — D-08/D-09/D-10
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  ensureEfectivoCaja,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  sembrarFinanzasTemplo,
  sembrarFinanzasGimnasioDos,
  limpiarFinanzasDeLaBateria,
  tenantDeLaFila,
  MONEDA_SEMBRADA,
  type FinanzasDeElTemplo,
  type FinanzasDelGimnasioDos,
} from "../fixtures/finance-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/admin/finance";

/** Fecha de la siembra propia de este archivo (la misma del fixture). */
const FECHA_SEMBRADA = "2026-01-15";

/**
 * Importes IRREPETIBLES por gimnasio y de otro orden de magnitud, misma tecnica
 * que el 172-18: si un saldo o un conteo se contamina con plata ajena, el numero
 * se va a otro orden y el rojo se lee solo.
 */
const MONTO_MOVIMIENTO_TEMPLO = 8_000_008;
const MONTO_EGRESO_TEMPLO = 6_000_006;
const MONTO_DEUDA_DOS = 909;
const MONTO_DEUDA_TEMPLO = 5_000_005;

/**
 * El unico usuario que sobrevive a `cleanAllTestData`, y su password.
 *
 * Se resuelve POR EMAIL y su id NUNCA se hardcodea: la base de CI no tiene el
 * mismo id que la local y un literal ahi es un rojo que solo aparece en el
 * pipeline. Lo siembra `test/setup.ts` con rol `owner`.
 */
const EMAIL_ADMIN_SEMILLA = "admin@test.com";
const PASS_ADMIN_SEMILLA = "adminpass123";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FinanzasDeElTemplo;
let dos: FinanzasDelGimnasioDos;

/** Id del unico usuario de El Templo que sobrevive a `cleanAllTestData`. */
let usuarioTemploId: number;
/** Token del staff de El Templo (control positivo "la ruta no esta rota para todos"). */
let tokenTemplo: string;
/** Socio de El Templo SIN suscripcion: el objetivo de los intentos de carga ajena. */
let socioTemploId: number;
/** Plan de El Templo (lo necesita su suscripcion y el control positivo del alta). */
let planTemploId: number;
/** Suscripcion activa CON DEUDA de El Templo — el espejo de la del gimnasio 2. */
let subTemploId: number;
/** Sede VIRTUAL del gimnasio 2 ("Templo Online" propia) — ver el docblock de la siembra. */
let sedeVirtualDosId: number;
/** SEGUNDA caja de efectivo del gimnasio 2 — el destino del movimiento propio. */
let cajaSecundariaDosId: number;
/** Suscripcion activa CON DEUDA del socio 0 del gimnasio 2 (control de pay-plan). */
let subDosId: number;
/** Las dos patas del movimiento inter-caja sembrado en El Templo. */
let movTemploOutflowId: number;
let movTemploInflowId: number;
/** Egreso sembrado en El Templo (objetivo del intento de anulacion ajena). */
let egresoTemploId: number;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmetico (copiado tal cual del 172-17/172-18):
  //  1. `cleanAllTestData` vacia ~90 tablas SIN filtro de gimnasio —incluidas
  //     `financial_transactions`, `transaction_links`, `balances` y
  //     `subscriptions`— y borra todos los users menos `admin@test.com`.
  //  2. `limpiarFinanzasDeLaBateria` va ANTES de `seedSecondTenant`: aquel
  //     arranca borrando la fila de `tenants` del gimnasio 2, y un centro de
  //     costo suyo sobreviviente del test anterior se lo impide por
  //     `fk_cost_centers_tenant` (`cost_centers` no esta en `TABLES_TO_CLEAN`).
  //     Llamarla despues no sirve: para entonces el `beforeEach` ya murio.
  //  3./4./5.: el esqueleto primero, las finanzas despues.
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarFinanzasTemplo(app);
  dos = await sembrarFinanzasGimnasioDos(app, gym2);

  // 6. Lo propio de este plan. Va a mano y NO por las rutas que el archivo pone
  //    a prueba: el fixture de una bateria de aislamiento no puede depender del
  //    mismo camino de escritura que esta midiendo (misma razon que
  //    `sembrarElAsiento` del 172-17).
  usuarioTemploId = await idDelAdminSemilla();
  tokenTemplo = await getAuthToken(
    app,
    EMAIL_ADMIN_SEMILLA,
    PASS_ADMIN_SEMILLA,
  );
  ({
    socioId: socioTemploId,
    planId: planTemploId,
    subId: subTemploId,
  } = await sembrarSocioYPlanDeElTemplo());
  sedeVirtualDosId = await sembrarSedeVirtualDelGimnasioDos();
  cajaSecundariaDosId = await sembrarSegundaCajaDelGimnasioDos();
  subDosId = await sembrarSuscripcionConDeudaDelGimnasioDos();
  ({ outflowId: movTemploOutflowId, inflowId: movTemploInflowId } =
    await sembrarMovimientoDeElTemplo());
  egresoTemploId = await sembrarEgresoDeElTemplo();
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (`isolate: false`), `branches` no esta en `TABLES_TO_CLEAN` y `cost_centers`
  // tampoco — sin esto, las sedes y los catalogos del gimnasio 2 se filtran al
  // archivo siguiente (T-171-14).
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Siembra propia de este archivo ──────────────────────────────────────────

/**
 * Id del admin semilla, resuelto POR EMAIL y nunca hardcodeado: la base de CI no
 * tiene el mismo id que la local, y un literal ahi es un rojo que solo aparece
 * en el pipeline.
 *
 * Juega el papel de "el socio del otro gimnasio" en los tres POST de
 * `/coach-load/*`: despues de `cleanAllTestData` es el UNICO usuario de El
 * Templo que queda vivo, y ni `financial_transactions.member_id` ni
 * `subscriptions.user_id` distinguen socios de staff (mismo criterio y mismo
 * motivo que la decision 5 del 172-18).
 */
async function idDelAdminSemilla(): Promise<number> {
  const [fila] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
        eq(schema.users.email, EMAIL_ADMIN_SEMILLA),
      ),
    )
    .limit(1);
  if (!fila) {
    throw new Error(
      "No existe admin@test.com en El Templo. Ese usuario lo siembra test/setup.ts y es el " +
        "unico que sobrevive a cleanAllTestData: sin el no hay socio ajeno al que apuntarle " +
        "los intentos de carga de este archivo.",
    );
  }
  return fila.id;
}

/**
 * El ESPEJO de El Templo: un plan, un socio sin suscripcion y una suscripcion
 * activa CON DEUDA colgada del admin semilla.
 *
 * Las tres piezas existen para que los casos de aislamiento MUERDAN, y cada una
 * neutraliza un falso verde distinto:
 *
 *   - **El socio sin sub** es el objetivo de `/alta` y `/misc`. Tiene que ser un
 *     socio DISTINTO del que lleva la suscripcion: `assignPlan` rechaza con
 *     conflicto (y no por tenancy) a quien ya tiene un plan presencial activo, y
 *     ese rechazo taparia el que este archivo quiere medir.
 *   - **La suscripcion con deuda** es el objetivo de `/pay-plan`. Sin ella, el
 *     rechazo de la ruta seria el trivial "este socio no tiene nada que
 *     renovar" y el caso pasaria en verde sin ejercer una sola linea de
 *     tenancy. Con ella, la ruta recorre `renewSubscription` ENTERO y el unico
 *     que corta es el guard de socio de `TransactionService.create`.
 *   - **El plan** lo necesitan las dos, y ademas es el que usa el control
 *     positivo de `/alta` corrido desde El Templo.
 *
 * `subscription_plans`, `subscriptions` y `balances` estan en `TABLES_TO_CLEAN`:
 * esta siembra es efimera y no necesita limpieza propia.
 */
async function sembrarSocioYPlanDeElTemplo(): Promise<{
  socioId: number;
  planId: number;
  subId: number;
}> {
  const ctx = { tenantId: TENANT_TEMPLO };
  const suf = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values(
      tenantValues(ctx, {
        // La unique es (tenant_id, name, country): el sufijo evita que dos
        // corridas del mismo worker choquen.
        name: `Plan de El Templo ${suf}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: "presencial" as const,
        priceRegular: 21000,
        priceZero: 18000,
        durationDays: 30,
        classesPerWeek: 3,
        currency: MONEDA_SEMBRADA,
      }),
    )
    .$returningId();

  // Socio REAL de El Templo (tenant 1 por default: `createTestMember` sin
  // `tenantId` es exactamente el camino del gimnasio 1).
  const socio = await createTestMember(app, {
    email: `socio-templo-${suf}@test.com`,
    branchId: templo.branchId,
  });

  const [sub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(ctx, {
        userId: usuarioTemploId,
        planId: plan.id,
        branchId: templo.branchId,
        status: "active" as const,
        startDate: FECHA_SEMBRADA,
        endDate: "2099-12-31",
        pricePaid: MONTO_DEUDA_TEMPLO,
        currency: MONEDA_SEMBRADA,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  await app.db.insert(schema.balances).values(
    tenantValues(ctx, {
      memberId: usuarioTemploId,
      targetKind: "subscription" as const,
      targetId: sub.id,
      currency: MONEDA_SEMBRADA,
      amount: MONTO_DEUDA_TEMPLO,
    }),
  );

  return { socioId: socio.id, planId: plan.id, subId: sub.id };
}

/**
 * La sede VIRTUAL "Templo Online" del gimnasio 2. No es decoracion: es el
 * requisito de adopcion que este plan descubrio.
 *
 * `resolveUserBranchId` (coach-load-routes.ts) resuelve la sede del socio y, si
 * el socio no aparece —que es EXACTAMENTE lo que pasa con un socio de otro
 * gimnasio desde que el SELECT lleva su `tenantWhere`—, cae a un fallback que
 * busca la sede llamada "Templo Online" DEL PROPIO gimnasio. Sin esa sede, el
 * fallback no encuentra nada y tira un Error pelado: la ruta contestaria con un
 * error del servidor en vez del payload vacio que pide el contrato.
 *
 * O sea: **un gimnasio nuevo necesita su propia sede virtual para adoptar
 * coach-load**. Queda anotado para la receta de adopcion (plan 172-23).
 *
 * `limpiarSegundoGimnasio` borra `branches` por `tenant_id`, asi que esta sede
 * se limpia sola con el resto del gimnasio 2.
 */
async function sembrarSedeVirtualDelGimnasioDos(): Promise<number> {
  const [sede] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(
        { tenantId: TENANT_DOS },
        {
          name: "Templo Online",
          code: `G2ONL${Date.now().toString(36)}`.toUpperCase().slice(0, 20),
          country: "AR",
          isVirtual: true,
          isActive: true,
        },
      ),
    )
    .$returningId();
  return sede.id;
}

/**
 * La SEGUNDA caja de efectivo del gimnasio 2, colgada de su sede virtual.
 *
 * Un movimiento inter-caja necesita DOS cajas propias, de la misma moneda y —lo
 * que no es obvio— las dos CON sede: `enforceCajaScope` (finance/routes.ts)
 * rechaza para un actor no-owner toda caja sin sucursal, porque sin sede no hay
 * pais con el que comparar. La cuenta banco del fixture tiene `branch_id` NULL,
 * asi que no sirve de destino: el rechazo llegaria por el guard de pais y no por
 * el de gimnasio, y el control positivo moriria por un motivo ajeno al
 * aislamiento.
 *
 * El invariante "una caja efectivo ACTIVA por (sucursal, moneda)" obliga a que
 * sea OTRA sede: por eso cuelga de la virtual. `ensureEfectivoCaja` es
 * idempotente y su 4to argumento NO es opcional en la practica (su default es 1,
 * asi que omitirlo estampa la caja en El Templo — T-168-15).
 */
async function sembrarSegundaCajaDelGimnasioDos(): Promise<number> {
  await ensureEfectivoCaja(app, sedeVirtualDosId, MONEDA_SEMBRADA, TENANT_DOS);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, { tenantId: TENANT_DOS }),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, sedeVirtualDosId),
      ),
    )
    .limit(1);
  if (!caja) {
    throw new Error(
      `La segunda caja del gimnasio ${TENANT_DOS} no quedo en su gimnasio. Si aparece en El ` +
        `Templo, a la llamada de ensureEfectivoCaja le falto el 4to argumento.`,
    );
  }
  return caja.id;
}

/**
 * Una suscripcion ACTIVA con DEUDA para el socio 0 del gimnasio 2.
 *
 * Es lo que hace posible el control positivo de `POST /pay-plan`: sin una sub
 * renovable y sin saldo pendiente, la ruta no tiene nada que cobrar y el control
 * no distinguiria "aislamiento correcto" de "ruta rota para todos". El
 * vencimiento va lejisimos a proposito para que `autoExpireSubscriptions` no la
 * vence entre el `beforeEach` y el `it`.
 */
async function sembrarSuscripcionConDeudaDelGimnasioDos(): Promise<number> {
  const ctx = { tenantId: TENANT_DOS };
  const [sub] = await app.db
    .insert(schema.subscriptions)
    .values(
      tenantValues(ctx, {
        userId: gym2.socios[0].id,
        planId: gym2.planId,
        branchId: gym2.branchId,
        status: "active" as const,
        startDate: FECHA_SEMBRADA,
        endDate: "2099-12-31",
        pricePaid: MONTO_DEUDA_DOS,
        currency: MONEDA_SEMBRADA,
        priceTypeApplied: "regular" as const,
      }),
    )
    .$returningId();

  // El saldo pendiente del socio contra esa sub: es lo que `pay-plan` lee para
  // decidir "settle" (cobrar la deuda) en vez de "renovar".
  await app.db.insert(schema.balances).values(
    tenantValues(ctx, {
      memberId: gym2.socios[0].id,
      targetKind: "subscription" as const,
      targetId: sub.id,
      currency: MONEDA_SEMBRADA,
      amount: MONTO_DEUDA_DOS,
    }),
  );
  return sub.id;
}

/**
 * Un movimiento inter-caja COMPLETO de El Templo: las dos patas
 * (`cash_transfer` outflow en la caja efectivo + inflow en la cuenta banco) y
 * los dos links que las hermanan.
 *
 * Las dos patas y los links importan: `voidMovement` camina
 * `transaction_links` para descubrir la pata hermana, asi que un intento de
 * anulacion ajena que se colara anularia LAS DOS. Con una sola pata sembrada el
 * caso no podria afirmar que la hermana tambien quedo intacta.
 */
async function sembrarMovimientoDeElTemplo(): Promise<{
  outflowId: number;
  inflowId: number;
}> {
  const outflowId = await sembrarFilaDeLedger({
    tenantId: TENANT_TEMPLO,
    kind: "cash_transfer",
    direction: "outflow",
    amount: MONTO_MOVIMIENTO_TEMPLO,
    branchId: templo.branchId,
    cashRegisterId: templo.cajaId,
    recordedBy: usuarioTemploId,
  });
  const inflowId = await sembrarFilaDeLedger({
    tenantId: TENANT_TEMPLO,
    kind: "cash_transfer",
    direction: "inflow",
    amount: MONTO_MOVIMIENTO_TEMPLO,
    branchId: null,
    cashRegisterId: templo.bankAccountId,
    recordedBy: usuarioTemploId,
  });
  await app.db.insert(schema.transactionLinks).values([
    tenantValues(
      { tenantId: TENANT_TEMPLO },
      {
        transactionId: outflowId,
        targetKind: "transaction" as const,
        targetId: inflowId,
        allocatedAmount: 0,
      },
    ),
    tenantValues(
      { tenantId: TENANT_TEMPLO },
      {
        transactionId: inflowId,
        targetKind: "transaction" as const,
        targetId: outflowId,
        allocatedAmount: 0,
      },
    ),
  ]);
  return { outflowId, inflowId };
}

/** Un egreso de El Templo, imputado a su caja y a su centro de costo. */
async function sembrarEgresoDeElTemplo(): Promise<number> {
  return sembrarFilaDeLedger({
    tenantId: TENANT_TEMPLO,
    kind: "expense",
    direction: "outflow",
    amount: MONTO_EGRESO_TEMPLO,
    branchId: templo.branchId,
    cashRegisterId: templo.cajaId,
    recordedBy: usuarioTemploId,
    costCenterId: templo.costCenterId,
  });
}

/**
 * Una fila de ledger SIN socio (`member_id` NULL), con gimnasio EXPLICITO.
 *
 * El universo de este plan es justamente ese: los movimientos y egresos no
 * cuelgan de ningun socio. Es la diferencia que el 172-18 dejo anotada — los
 * listados con `INNER JOIN users` tienen una segunda barrera "gratis", y estas
 * filas NO la tienen.
 *
 * `tenant_id` tiene DEFAULT 1 desde la fase 167: un INSERT que omita la columna
 * siembra en El Templo sin avisar y la siembra MIENTE (T-168-15). Por eso pasa
 * por `tenantValues` y por eso las precondiciones releen el gimnasio de cada
 * fila desde la base.
 */
async function sembrarFilaDeLedger(datos: {
  tenantId: number;
  kind: "cash_transfer" | "expense";
  direction: "inflow" | "outflow";
  amount: number;
  branchId: number | null;
  cashRegisterId: number;
  recordedBy: number;
  costCenterId?: number;
}): Promise<number> {
  const [fila] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(
        { tenantId: datos.tenantId },
        {
          memberId: null,
          kind: datos.kind,
          direction: datos.direction,
          amount: datos.amount,
          currency: MONEDA_SEMBRADA,
          paymentMethod: "internal" as const,
          transactionDate: FECHA_SEMBRADA,
          effectiveDate: FECHA_SEMBRADA,
          branchId: datos.branchId,
          cashRegisterId: datos.cashRegisterId,
          costCenterId: datos.costCenterId,
          recordedBy: datos.recordedBy,
          validationStatus: "validado" as const,
        },
      ),
    )
    .$returningId();
  return fila.id;
}

// ─── Utilidades de request ───────────────────────────────────────────────────

/**
 * GET como staff del gimnasio 2. El token va EXPLICITO en cada llamada (y no
 * escondido adentro del helper) porque el rol del actor es parte de lo que este
 * archivo afirma: D-10 pide que cada ruta corra con el minimo real, y eso tiene
 * que verse en el call site.
 */
async function getComoGimnasioDos(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** POST como staff del gimnasio 2, con el token explicito (ver arriba). */
async function postComoGimnasioDos(
  url: string,
  token: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Clave de idempotencia unica por intento (las 3 rutas de carga la exigen). */
function claveIdempotente(etiqueta: string): string {
  return `iso03-${etiqueta}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// ─── Evidencia leida de la BASE ──────────────────────────────────────────────

/**
 * Normaliza la salida de `app.db.execute`, que devuelve `[filas, metadata]` en
 * mysql2 y a veces las filas peladas. Mismo molde que
 * `test/fixtures/finance-gimnasio-dos.ts` y que el archivo del 172-18.
 */
async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/**
 * Cuantas filas de ledger tiene un gimnasio, leidas de la base.
 *
 * Se usa antes y despues de cada intento de escritura ajena: el status dice lo
 * que la ruta contesto, esto dice lo que quedo escrito. Un handler que inserte y
 * despues conteste que no encontro al socio pasaria mirando solo el status.
 */
async function contarLedgerDelGimnasio(tenantId: number): Promise<number> {
  const filas = await consultar<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM financial_transactions WHERE tenant_id = ${tenantId}`,
  );
  return Number(filas[0]?.n ?? 0);
}

/**
 * Cuantas suscripciones tiene un socio, EN CUALQUIER GIMNASIO.
 *
 * Deliberadamente sin filtro de gimnasio: la pregunta es "¿el alta ajena dejo
 * una sub colgada en algun lado?", y filtrar por gimnasio ya asumiria la
 * respuesta. Es la misma exencion —y el mismo razonamiento— de `tenantDeLaFila`.
 * (`subscriptions` no es tabla strict de finance, pero la exencion embebida deja
 * la intencion escrita para cuando la fase 173 la incorpore.)
 */
async function contarSubsDelSocio(userId: number): Promise<number> {
  const filas = await consultar<{ n: number }>(
    sql`SELECT /* tenant-safe: la pregunta es si el alta ajena dejo una sub en ALGUN gimnasio; filtrar por uno la volveria tautologica */ COUNT(*) AS n FROM subscriptions WHERE user_id = ${userId}`,
  );
  return Number(filas[0]?.n ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // Heredada del 172-17 y del 172-18, y aca pesa MAS: `enforceCajaScope`
    // (finance/routes.ts) compara el pais de la caja contra el del actor. Si las
    // sedes fueran de paises distintos, TODOS los casos de movimientos y egresos
    // pasarian en verde sin que la capa de tenancy hiciera nada.
    const [sedeDos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    const [sedeTemplo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_TEMPLO }),
          eq(schema.branches.id, templo.branchId),
        ),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      `Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO aisla; con ` +
        `paises distintos el guard de pais de las cajas rechazaria igual y los casos de abajo ` +
        `pasarian sin ejercer la capa de tenancy. Arreglo: que las dos sedes vuelvan a ser AR ` +
        `(test/fixtures/second-tenant.ts y test/setup.ts), NO relajar estas aserciones.`,
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene un movimiento y un egreso VIVOS, sin anular", async () => {
    // Sin recurso ajeno vivo, "el gimnasio 2 no puede anular nada de El Templo"
    // es trivialmente cierto. Y si las filas ya nacieran anuladas, el caso de
    // anulacion ajena no podria distinguir un rechazo de un exito.
    for (const id of [movTemploOutflowId, movTemploInflowId, egresoTemploId]) {
      expect(
        await tenantDeLaFila(app, "financial_transactions", id),
        `La fila ${id} no quedo en El Templo (${TENANT_TEMPLO}). Sin movimiento ni egreso ajeno ` +
          `vivo, los casos de anulacion de este archivo prueban nada. Revisar la siembra propia ` +
          `del beforeEach.`,
      ).toBe(TENANT_TEMPLO);
      expect(
        await estaAnulada(id),
        `La fila ${id} de El Templo nacio ANULADA. Los casos de anulacion ajena comparan contra ` +
          `"sigue sin anular": con la fila ya anulada, un void que se colara seria invisible.`,
      ).toBe(false);
    }
  });

  it("el gimnasio 2 tiene finanzas, sede virtual propia y un socio con deuda", async () => {
    expect(
      [
        await tenantDeLaFila(app, "cash_registers", dos.cajaId),
        await tenantDeLaFila(app, "cash_registers", dos.bankAccountId),
        await tenantDeLaFila(app, "cost_centers", dos.costCenterId),
      ],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ese ` +
        `INSERT perdio su \`tenantValues\` y cayo en el DEFAULT 1 de la columna (T-168-15): el ` +
        `"segundo gimnasio" seria en realidad El Templo y TODOS los controles positivos de abajo ` +
        `estarian mirando datos de El Templo.`,
    ).toEqual([TENANT_DOS, TENANT_DOS, TENANT_DOS]);

    const [virtual] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
          eq(schema.branches.id, sedeVirtualDosId),
        ),
      );
    expect(
      virtual?.id,
      `El gimnasio 2 se quedo sin su sede virtual "Templo Online". La necesita el fallback de ` +
        `resolveUserBranchId (coach-load-routes.ts) cuando el socio pedido NO es suyo: sin ella, ` +
        `las rutas de carga contestan un error del servidor en vez del payload vacio del ` +
        `contrato. Es un REQUISITO DE ADOPCION, no un detalle del test.`,
    ).toBe(sedeVirtualDosId);

    expect(
      await tenantDeLaFila(app, "balances", await idDelBalanceDeLaSub()),
      `El saldo pendiente del socio del gimnasio 2 no quedo en su gimnasio: el control positivo ` +
        `de pay-plan estaria leyendo la deuda de otro.`,
    ).toBe(TENANT_DOS);
    expect(
      subDosId,
      `No se sembro la suscripcion del socio del gimnasio 2: sin ella, pay-plan no tiene control ` +
        `positivo y su caso de aislamiento pasaria por la razon equivocada.`,
    ).toBeGreaterThan(0);
  });

  it("las dos cajas del gimnasio 2 comparten moneda (si no, el movimiento propio no es posible)", async () => {
    // `registerMovement` rechaza el cruce de monedas ANTES de cualquier otra
    // validacion (D-03): con monedas distintas, el control positivo de
    // POST /movements fallaria por una razon que no tiene nada que ver con el
    // aislamiento, y el caso de aislamiento de al lado quedaria sin su testigo.
    const monedas = await app.db
      .select({ currency: schema.cashRegisters.currency })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, { tenantId: TENANT_DOS }),
          eq(schema.cashRegisters.isActive, true),
        ),
      );
    expect(
      new Set(monedas.map((m) => m.currency)),
      `Las cajas del gimnasio 2 dejaron de compartir moneda. El guard de moneda de ` +
        `registerMovement (D-03) rechazaria el movimiento PROPIO y el control positivo moriria ` +
        `por un motivo ajeno al aislamiento.`,
    ).toEqual(new Set([MONEDA_SEMBRADA]));
  });
});

/** Id del balance sembrado para la sub del gimnasio 2 (solo para la precondicion). */
async function idDelBalanceDeLaSub(): Promise<number> {
  const [fila] = await app.db
    .select({ id: schema.balances.id })
    .from(schema.balances)
    .where(
      and(
        tenantWhere(schema.balances, { tenantId: TENANT_DOS }),
        eq(schema.balances.targetId, subDosId),
      ),
    )
    .limit(1);
  if (!fila) {
    throw new Error(
      "No se encontro el saldo del socio del gimnasio 2 (sub " +
        `${subDosId}). Lo siembra el beforeEach de este archivo.`,
    );
  }
  return fila.id;
}

/**
 * Si una fila de ledger esta anulada, leido de la base SIN filtrar por gimnasio.
 *
 * Fase 172: `financial_transactions` es tabla strict, asi que este SELECT hace
 * throw sin anotacion. La exencion `tenant-safe:` va EMBEBIDA en el SQL (unico
 * canal que el sentinel lee) y es la salida CORRECTA, no un escape: releer la
 * fila AJENA es la asercion de tampering, y filtrarla por gimnasio la volveria
 * tautologica. Mismo razonamiento que `tenantDeLaFila` y que
 * `fotoDeLaTransaccion` del 172-18.
 */
/**
 * SALDO de una caja, calculado de la base sumando TODAS las filas de ledger
 * imputadas a ella (inflow suma, outflow resta), sin filtrar por gimnasio.
 *
 * La falta de filtro es EL PUNTO, no un descuido: lo que este archivo tiene que
 * cazar es una fila del gimnasio 2 imputada a una caja de El Templo (o al
 * reves). Sumar solo las filas del gimnasio de la caja esconderia exactamente la
 * plata que se colo — la asercion se volveria ciega justo para el caso que la
 * motiva. Por eso lleva la exencion `tenant-safe:` embebida, el unico canal que
 * el sentinel lee, con el mismo razonamiento que `tenantDeLaFila`.
 *
 * Las filas anuladas quedan afuera (`voided_at IS NULL`): un movimiento anulado
 * ya no mueve el saldo, que es justo lo que afirman los casos de anulacion.
 */
async function saldoDeLaCaja(cajaId: number): Promise<number> {
  const filas = await consultar<{ saldo: string | number | null }>(
    sql`SELECT /* tenant-safe: el punto es cazar una fila de OTRO gimnasio imputada a esta caja; filtrar por gimnasio esconderia justamente la plata colada */ COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount ELSE -amount END), 0) AS saldo FROM financial_transactions WHERE cash_register_id = ${cajaId} AND voided_at IS NULL`,
  );
  return Number(filas[0]?.saldo ?? 0);
}

async function estaAnulada(id: number): Promise<boolean> {
  const filas = await consultar<{ voided_at: unknown }>(
    sql`SELECT /* tenant-safe: releer la fila AJENA es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ voided_at FROM financial_transactions WHERE id = ${id}`,
  );
  if (filas[0] === undefined) {
    throw new Error(
      `La fila ${id} no existe: un intento de anulacion ajena la BORRO, o la siembra fallo.`,
    );
  }
  return filas[0].voided_at !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH-LOAD — las 7 rutas, con el rol COACH (D-10: el borde menos privilegiado)
//
// `coach-load-routes.ts` declara su propio hook `onRequest` con
// FINANCE_LOAD_ROLES justamente para que el coach entre aca y SOLO aca. Es el
// actor mas barato de conseguir para un atacante y el que menos deberia ver.
// ═══════════════════════════════════════════════════════════════════════════

/** Mensaje compartido de los rojos de AISLAMIENTO en lecturas. */
function porQueImportaLaLectura(ruta: string, detalle: string): string {
  return (
    `${ruta} le mostro al COACH del gimnasio ${TENANT_DOS} ${detalle}. Eso es una fuga de datos ` +
    `entre gimnasios por el borde MENOS privilegiado del modulo (T-172-19-01): revisar el ` +
    `\`tenantWhere\` del metodo que sirve la ruta en src/modules/finance/ y que el \`ctx\` salga ` +
    `de \`assertTenant(request.scope, …)\`. NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de CONTROL POSITIVO. */
function porQueImportaElControl(ruta: string): string {
  return (
    `${ruta} NO funciono con los recursos PROPIOS del gimnasio ${TENANT_DOS}. Esto no es un ` +
    `problema de aislamiento sino de siembra o de scope de mas: sin este control, el caso de ` +
    `aislamiento de al lado pasaria en verde por la razon equivocada (una base vacia tambien ` +
    `"no filtra nada"). Revisar la siembra del beforeEach y el guard de sede/pais de la ruta ` +
    `antes de tocar la capa de tenancy.`
  );
}

/** Mensaje compartido de los rojos de AISLAMIENTO en escrituras. */
function porQueImportaLaEscritura(ruta: string, detalle: string): string {
  return (
    `${ruta} dejo que el staff del gimnasio ${TENANT_DOS} ${detalle}. Eso es tampering ` +
    `cross-tenant: el contrato del milestone (D-09) es que el recurso ajeno sea indistinguible ` +
    `de uno inexistente, y que NADA quede escrito. Empezar por el \`tenantWhere\` del SELECT que ` +
    `valida ese id (transaction-service.ts create(), movement-service.ts loadCaja, o el guard de ` +
    `la ruta en finance/routes.ts).`
  );
}

describe("autocompletar del socio — GET /coach-load/autocompletar/:userId (actor: COACH, rol minimo real)", () => {
  const RUTA = "GET /api/admin/finance/coach-load/autocompletar/:userId";

  it("aislamiento: pidiendo por un socio de El Templo no devuelve la SEDE del socio ajeno", async () => {
    const res = await getComoGimnasioDos(
      `/coach-load/autocompletar/${usuarioTemploId}`,
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      hasRenewable: boolean;
      planName: string | null;
      amount: number | null;
      memberBranchId: number;
    };

    // Lo que ESTE modulo garantiza: `memberBranchId` sale de
    // `resolveUserBranchId` (coach-load-routes.ts), que filtra el socio por
    // gimnasio y cae al fallback "Templo Online" PROPIO cuando no lo encuentra.
    // Si ese `tenantWhere` desapareciera, la respuesta traeria la sede REAL de
    // El Templo — un dato del otro gimnasio, servido por una ruta que se alcanza
    // con el token mas barato que existe.
    expect(
      cuerpo.memberBranchId,
      porQueImportaLaLectura(
        RUTA,
        `la sede REAL del socio ajeno (${templo.branchId}) en \`memberBranchId\`. El SELECT de ` +
          `resolveUserBranchId (coach-load-routes.ts) perdio su tenantWhere: el socio de otro ` +
          `gimnasio volvio a existir para este handler`,
      ),
    ).not.toBe(templo.branchId);
    expect(
      cuerpo.memberBranchId,
      `${RUTA} devolvio una sede que no es la virtual del gimnasio ${TENANT_DOS}. El fallback de ` +
        `resolveUserBranchId tiene que caer en la "Templo Online" PROPIA (${sedeVirtualDosId}).`,
    ).toBe(sedeVirtualDosId);
  });

  // ⚠️⚠️ FUGA REAL, ENCONTRADA POR ESTA BATERIA — DUEÑO: FASE 173 ⚠️⚠️
  //
  // `subscriptionService.getMemberSubscription(userId)` es la UNICA llamada de
  // este handler que NO recibe `ctx`: su query filtra por `userId` y por estado,
  // sin gimnasio (src/modules/subscriptions/service.ts, ~L919). Con un socio de
  // OTRO gimnasio que tenga una sub vigente, la ruta devuelve su `planName`, su
  // `amount`, su `currency` y su `currentEndDate` — al COACH del gimnasio 2, que
  // es el actor menos privilegiado del sistema, y con solo iterar ids.
  //
  // NO se arregla en esta fase por decision explicita del CONTEXT (D-07: en
  // archivos ajenos se tocan UNICAMENTE las queries sobre las 6 tablas strict de
  // finance, y `subscriptions` no es una de ellas — su migracion es la fase 173).
  //
  // El `it` de abajo afirma el contrato CORRECTO y esta marcado como fallo
  // ESPERADO. Es a proposito y es lo contrario de esconderlo:
  //   - hoy documenta la fuga con una asercion ejecutable, no con un comentario;
  //   - el dia que la fase 173 le pase el gimnasio a esa query, este `it` se
  //     pone en ROJO ("esperaba fallar y paso") y obliga a quien lo arregle a
  //     desmarcarlo y dejarlo como un caso de aislamiento normal.
  // NO lo borres para "poner el archivo en verde": ya esta en verde, y borrarlo
  // borra la unica prueba de que la fuga existe.
  it.fails(
    "FUGA CONOCIDA (dueño: fase 173): el coach del gimnasio 2 SI ve el plan de un socio de El Templo",
    async () => {
      const res = await getComoGimnasioDos(
        `/coach-load/autocompletar/${usuarioTemploId}`,
        gym2.coachToken,
      );
      const cuerpo = JSON.parse(res.body) as {
        hasRenewable: boolean;
        planName: string | null;
        amount: number | null;
      };
      expect(
        [cuerpo.hasRenewable, cuerpo.planName, cuerpo.amount],
        porQueImportaLaLectura(
          RUTA,
          `el plan del socio ${usuarioTemploId}, que es de El Templo. Si estas leyendo este ` +
            `mensaje, la fuga se ARREGLO: sacale el marcador de fallo esperado a este \`it\` y ` +
            `dejalo como el caso de aislamiento que siempre tuvo que ser`,
        ),
      ).toEqual([false, null, null]);
    },
  );

  it("control: con un socio propio devuelve su plan, su deuda y su sede", async () => {
    const res = await getComoGimnasioDos(
      `/coach-load/autocompletar/${gym2.socios[0].id}`,
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      hasRenewable: boolean;
      amount: number | null;
      intent: string | null;
      outstanding: number;
      memberBranchId: number;
    };
    expect(
      [
        cuerpo.hasRenewable,
        cuerpo.intent,
        cuerpo.outstanding,
        cuerpo.memberBranchId,
      ],
      porQueImportaElControl(RUTA) +
        ` Respuesta: ${res.body}. Se espera la sub sembrada (deuda ${MONTO_DEUDA_DOS}, sede ` +
        `${gym2.branchId}).`,
    ).toEqual([true, "settle", MONTO_DEUDA_DOS, gym2.branchId]);
  });
});

describe("cuentas banco de la PoS — GET /coach-load/bank-accounts (actor: COACH, rol minimo real)", () => {
  const RUTA = "GET /api/admin/finance/coach-load/bank-accounts";

  it("aislamiento: no devuelve ni una cuenta banco de El Templo", async () => {
    const res = await getComoGimnasioDos(
      "/coach-load/bank-accounts",
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuentas = JSON.parse(res.body).accounts as Array<{
      id: number;
      name: string;
    }>;

    // Barrido por el `tenant_id` REAL de cada fila devuelta, no por "no aparece
    // el id que sembre": asi caza tambien las cuentas "Banco ARS"/"Banco EUR"
    // que siembra test/setup.ts para El Templo y que este archivo no creo.
    for (const cuenta of cuentas) {
      expect(
        await tenantDeLaFila(app, "cash_registers", cuenta.id),
        porQueImportaLaLectura(
          RUTA,
          `la cuenta banco ${cuenta.id} ("${cuenta.name}"), que no es suya`,
        ),
      ).toBe(TENANT_DOS);
    }
  });

  it("control: SI devuelve su propia cuenta banco", async () => {
    const res = await getComoGimnasioDos(
      "/coach-load/bank-accounts",
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuentas = JSON.parse(res.body).accounts as Array<{
      id: number;
      name: string;
    }>;
    expect(
      cuentas.map((c) => c.id),
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toContain(dos.bankAccountId);
    expect(
      cuentas.find((c) => c.id === dos.bankAccountId)?.name,
      `${RUTA} devolvio la cuenta propia con otro nombre que el sembrado: la siembra o el ` +
        `mapeo de la ruta cambiaron.`,
    ).toBe(dos.bankAccountName);
  });
});

describe("caja destino del cobro en efectivo — GET /coach-load/caja-efectivo (actor: COACH, rol minimo real)", () => {
  const RUTA = "GET /api/admin/finance/coach-load/caja-efectivo";

  it("aislamiento: pidiendo por una sede de El Templo no resuelve ninguna caja", async () => {
    const res = await getComoGimnasioDos(
      `/coach-load/caja-efectivo?currency=${MONEDA_SEMBRADA}&branchId=${templo.branchId}`,
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const caja = JSON.parse(res.body).caja as { id: number } | null;
    expect(
      caja,
      porQueImportaLaLectura(
        RUTA,
        `la caja de la sede ${templo.branchId} de El Templo. La ruta informa, read-only, la caja ` +
          `que create() va a usar al confirmar: si acá aparece una caja ajena, el cobro siguiente ` +
          `entra al arqueo del otro gimnasio`,
      ),
    ).toBeNull();
  });

  it("control: con su propia sede SI resuelve su caja de efectivo", async () => {
    const res = await getComoGimnasioDos(
      `/coach-load/caja-efectivo?currency=${MONEDA_SEMBRADA}&branchId=${gym2.branchId}`,
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const caja = JSON.parse(res.body).caja as { id: number } | null;
    expect(
      caja?.id,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(dos.cajaId);
  });
});

describe("cargas del profe — GET /coach-load/mis-cargas (actor: COACH, rol minimo real)", () => {
  const RUTA = "GET /api/admin/finance/coach-load/mis-cargas";

  it("aislamiento: el coach no ve ni una carga de El Templo", async () => {
    const res = await getComoGimnasioDos(
      "/coach-load/mis-cargas",
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const rows = JSON.parse(res.body).rows as Array<{ id: number }>;
    for (const fila of rows) {
      expect(
        await tenantDeLaFila(app, "financial_transactions", fila.id),
        porQueImportaLaLectura(
          RUTA,
          `la transaccion ${fila.id}, que no es suya`,
        ),
      ).toBe(TENANT_DOS);
    }
  });

  it("aislamiento: tampoco las ve el ADMIN del gimnasio 2, que si ve TODAS las cargas propias", async () => {
    // Este caso corre con `adminToken` A PROPOSITO y es el que de verdad ejerce
    // la capa de tenancy: para un coach la ruta fuerza `recordedBy = él mismo`,
    // asi que las filas de El Templo quedarian afuera aunque el filtro de
    // gimnasio no existiera. El admin ve TODAS las cargas de su gimnasio, y ahi
    // el unico filtro que separa los dos gimnasios es el de tenancy.
    //
    // (Hallazgo heredado del 172-18: `list()` ademas hace INNER JOIN de `users`
    // con su propio tenantWhere, asi que este listado tiene DOS barreras. Un
    // verde aca no dice cual de las dos lo sostiene — eso lo mide la mutacion de
    // cierre del plan.)
    const res = await getComoGimnasioDos(
      "/coach-load/mis-cargas",
      gym2.adminToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      rows: Array<{ id: number }>;
      total: number;
    };
    for (const fila of cuerpo.rows) {
      expect(
        await tenantDeLaFila(app, "financial_transactions", fila.id),
        porQueImportaLaLectura(
          RUTA,
          `la transaccion ${fila.id} de El Templo (con el rol admin, que ve TODAS las cargas)`,
        ),
      ).toBe(TENANT_DOS);
    }
    // El contador va aparte de las filas: son DOS queries y un filtro que viva
    // en una sola dejaria al staff viendo N filas y un total mas grande.
    expect(
      cuerpo.total,
      porQueImportaLaLectura(
        RUTA,
        `un CONTADOR (${cuerpo.total}) mas grande que las filas que devolvio (${cuerpo.rows.length}): ` +
          `el COUNT y la query de filas no comparten el filtro de gimnasio`,
      ),
    ).toBe(cuerpo.rows.length);
  });

  it("control: el coach SI ve la carga que acaba de hacer", async () => {
    const alta = await postComoGimnasioDos(
      "/coach-load/misc",
      gym2.coachToken,
      {
        memberId: gym2.socios[1].id,
        amount: 4321,
        concepto: "Control positivo mis-cargas",
        paymentMethod: "cash",
        miscReason: "otro",
        idempotencyKey: claveIdempotente("mis-cargas"),
      },
    );
    expect(
      alta.statusCode,
      `No se pudo sembrar la carga propia via POST /coach-load/misc: ${alta.body}`,
    ).toBe(201);
    const creada = JSON.parse(alta.body).transaction.id as number;

    const res = await getComoGimnasioDos(
      "/coach-load/mis-cargas",
      gym2.coachToken,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const rows = JSON.parse(res.body).rows as Array<{ id: number }>;
    expect(
      rows.map((r) => r.id),
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toContain(creada);
  });
});

describe("alta de alumno con plan — POST /coach-load/alta (actor: COACH, rol minimo real)", () => {
  const RUTA = "POST /api/admin/finance/coach-load/alta";
  // NOTA sobre el vector "sede ajena": este archivo NO lo afirma en esta ruta.
  // `/alta` lleva el preHandler `requireBranchAccess({from:"body.branchId"})`,
  // que para un coach corta con un "prohibido" ANTES de llegar a la capa de
  // tenancy — un status que este milestone no define y que el criterio de
  // aceptacion del plan prohibe afirmar. El vector de la sede ajena SI esta
  // cubierto donde el guard de tenancy es el que corta: `POST /cash-registers/
  // efectivo` (172-17) y `POST /transactions` (172-18).

  it("aislamiento: no puede darle un plan a un socio de El Templo, y no queda NADA escrito", async () => {
    const ledgerTemploAntes = await contarLedgerDelGimnasio(TENANT_TEMPLO);
    const ledgerDosAntes = await contarLedgerDelGimnasio(TENANT_DOS);
    const subsAntes = await contarSubsDelSocio(socioTemploId);

    const res = await postComoGimnasioDos("/coach-load/alta", gym2.coachToken, {
      userId: socioTemploId,
      branchId: gym2.branchId,
      planId: gym2.planId,
      paymentMethod: "cash",
      idempotencyKey: claveIdempotente("alta-ajena"),
    });
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `le asignara un plan al socio ${socioTemploId} de El Templo`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    // El MOTIVO del rechazo importa tanto como el rechazo: la ruta tiene DOS
    // formas de contestar "no encontrado" y solo una es la barrera de tenancy
    // (el SELECT de `users` con tenantWhere de TransactionService.create). Sin
    // esta asercion, el caso pasaria en verde el dia que la ruta se rompiera por
    // cualquier otro motivo — que es exactamente lo que le pasa hoy con un socio
    // PROPIO (ver el `it` de la limitacion conocida, mas abajo).
    expect(
      JSON.parse(res.body).message,
      `${RUTA} rechazo el alta ajena por un motivo que NO es el guard de socio. El caso mide la ` +
        `barrera de tenancy de TransactionService.create: si el rechazo viene de otro lado, este ` +
        `test dejo de probar lo que dice probar. Respuesta: ${res.body}`,
    ).toContain("Miembro no encontrado");

    // La evidencia REAL: `assignPlan` inserta la suscripcion y el cobro dentro de
    // UNA transaccion, asi que un rechazo tardio tiene que haber rolleado las
    // dos. Un alta ajena que dejara la sub y no el cobro seria peor que una que
    // no rechaza: plata invisible con socio prestado.
    expect(
      await contarSubsDelSocio(socioTemploId),
      porQueImportaLaEscritura(
        RUTA,
        `dejara una SUSCRIPCION colgada del socio ajeno aunque la respuesta dijera que no existe ` +
          `(el rollback de assignPlan no cubrio el insert de la sub)`,
      ),
    ).toBe(subsAntes);
    expect(
      [
        await contarLedgerDelGimnasio(TENANT_TEMPLO),
        await contarLedgerDelGimnasio(TENANT_DOS),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `escribiera una fila de ledger igual (el rechazo llego DESPUES del INSERT)`,
      ),
    ).toEqual([ledgerTemploAntes, ledgerDosAntes]);
  });

  it("control: la ruta funciona de punta a punta EN EL GIMNASIO 1 (descarta 'esta rota para todos')", async () => {
    // El control positivo de esta ruta corre en El Templo y NO en el gimnasio 2,
    // por el motivo que documenta el `it` de abajo. Sigue haciendo su trabajo de
    // control: descarta que el caso de aislamiento de arriba este pasando porque
    // el alta este rota para cualquiera. Actor: el staff de El Templo sobre sus
    // propios socio, sede y plan.
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/coach-load/alta`,
      headers: { authorization: `Bearer ${tokenTemplo}` },
      payload: {
        userId: socioTemploId,
        branchId: templo.branchId,
        planId: planTemploId,
        paymentMethod: "cash",
        idempotencyKey: claveIdempotente("alta-templo"),
      },
    });
    expect(
      res.statusCode,
      `${RUTA} no funciono NI SIQUIERA en El Templo con recursos propios: la ruta esta rota para ` +
        `todos y el caso de aislamiento de arriba estaria pasando por la razon equivocada. ` +
        `Respuesta: ${res.body}`,
    ).toBe(201);
    const cuerpo = JSON.parse(res.body) as {
      transaction: { id: number } | null;
    };
    expect(
      cuerpo.transaction?.id,
      `${RUTA} contesto 201 pero sin cobro. El plan sembrado tiene precio > 0, asi que assignPlan ` +
        `tiene que haber creado el charge: sin el, el camino de escritura no se recorrio entero.`,
    ).toBeGreaterThan(0);
    expect(
      await tenantDeLaFila(
        app,
        "financial_transactions",
        cuerpo.transaction?.id ?? 0,
      ),
      `El cobro del alta de El Templo no nacio en El Templo (${TENANT_TEMPLO}).`,
    ).toBe(TENANT_TEMPLO);
  });

  // ⚠️⚠️ LIMITACION CONOCIDA DE LA ADOPCION — DUEÑO: FASE 173 ⚠️⚠️
  //
  // El alta con recursos PROPIOS del gimnasio 2 hoy NO se puede completar, y el
  // motivo no es finance: `assignPlan` inserta la fila de `subscriptions` SIN
  // `tenantValues` (src/modules/subscriptions/service.ts, ~L1592), asi que la
  // sub del gimnasio 2 nace con el `DEFAULT 1` de la columna — o sea, en El
  // Templo (T-168-15). Acto seguido, el charge la valida como concepto enlazado
  // CON el filtro de gimnasio (TransactionService.create, paso 1d) y no la
  // encuentra: la operacion entera se rollea.
  //
  // Es fail-closed y NO es una fuga: nada queda escrito, ni en un gimnasio ni en
  // el otro. Pero significa que **el alta de coach-load no es usable por un
  // gimnasio nuevo hasta que la fase 173 migre `subscriptions`**, y eso tiene
  // que estar escrito en la receta de adopcion (172-23) y en el SUMMARY.
  //
  // NO se arregla en esta fase por decision explicita del CONTEXT (D-07: en
  // archivos ajenos se tocan UNICAMENTE las queries sobre las 6 tablas strict de
  // finance, y `subscriptions` no es una de ellas).
  //
  // El `it` de abajo afirma lo unico que hoy se puede certificar de esta ruta
  // para el gimnasio 2 —que el rechazo es LIMPIO— y deja anclado el motivo. El
  // dia que la fase 173 estampe el gimnasio, el rechazo desaparece, este `it` se
  // pone en ROJO y quien lo arregle tiene que convertirlo en el control positivo
  // que hoy no se puede escribir (201 + sub y charge en el gimnasio 2).
  it("limitacion conocida (dueño: fase 173): con recursos PROPIOS el alta se corta en el charge, sin escribir nada", async () => {
    const ledgerDosAntes = await contarLedgerDelGimnasio(TENANT_DOS);
    const subsAntes = await contarSubsDelSocio(gym2.socios[1].id);

    const res = await postComoGimnasioDos("/coach-load/alta", gym2.coachToken, {
      userId: gym2.socios[1].id,
      branchId: gym2.branchId,
      planId: gym2.planId,
      paymentMethod: "cash",
      idempotencyKey: claveIdempotente("alta-propia"),
    });
    expect(
      res.statusCode,
      `${RUTA} cambio de comportamiento con recursos propios del gimnasio ${TENANT_DOS}. Si ahora ` +
        `contesta 201, la fase 173 migro \`subscriptions\`: convertí este \`it\` en el control ` +
        `positivo de la ruta (201 + la sub y el charge con tenant_id = ${TENANT_DOS}) y borrá esta ` +
        `nota. Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      JSON.parse(res.body).message,
      `${RUTA} rechazo el alta propia por un motivo distinto del documentado (la sub nace en el ` +
        `gimnasio ${TENANT_TEMPLO} y el charge no la encuentra). Revisar antes de tocar nada. ` +
        `Respuesta: ${res.body}`,
    ).toContain("Concepto enlazado no existe");

    // Lo que SI se certifica hoy: el rechazo es limpio en los dos gimnasios. Una
    // sub colgada en El Templo con el socio del gimnasio 2 seria un cruce de
    // datos de verdad, no una limitacion.
    expect(
      [
        await contarSubsDelSocio(gym2.socios[1].id),
        await contarLedgerDelGimnasio(TENANT_DOS),
      ],
      `${RUTA} dejo rastro pese al rechazo: el rollback de assignPlan no cubrio todo. Una sub del ` +
        `socio del gimnasio ${TENANT_DOS} sobreviviendo en El Templo seria un cruce de datos ` +
        `REAL, no la limitacion conocida.`,
    ).toEqual([subsAntes, ledgerDosAntes]);
  });
});

describe("cobro suelto — POST /coach-load/misc (actor: COACH, rol minimo real)", () => {
  const RUTA = "POST /api/admin/finance/coach-load/misc";

  it("aislamiento: no puede cobrarle a un socio de El Templo, y no nace ninguna fila", async () => {
    const ledgerTemploAntes = await contarLedgerDelGimnasio(TENANT_TEMPLO);
    const ledgerDosAntes = await contarLedgerDelGimnasio(TENANT_DOS);

    const res = await postComoGimnasioDos("/coach-load/misc", gym2.coachToken, {
      memberId: socioTemploId,
      amount: 5150,
      concepto: "Cobro contra socio ajeno",
      paymentMethod: "cash",
      miscReason: "otro",
      idempotencyKey: claveIdempotente("misc-ajeno"),
    });
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `le cobrara al socio ${socioTemploId} de El Templo`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      JSON.parse(res.body).message,
      `${RUTA} rechazo el cobro ajeno por un motivo que NO es el guard de socio (el SELECT de ` +
        `\`users\` con tenantWhere de TransactionService.create). Respuesta: ${res.body}`,
    ).toContain("Miembro no encontrado");
    expect(
      [
        await contarLedgerDelGimnasio(TENANT_TEMPLO),
        await contarLedgerDelGimnasio(TENANT_DOS),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `escribiera el cobro igual (el rechazo llego DESPUES del INSERT). El guard que tiene que ` +
          `cortar es el SELECT de \`users\` con tenantWhere de TransactionService.create`,
      ),
    ).toEqual([ledgerTemploAntes, ledgerDosAntes]);
  });

  it("control: SI puede cobrarle a un socio propio, y la fila cae en su caja", async () => {
    const res = await postComoGimnasioDos("/coach-load/misc", gym2.coachToken, {
      memberId: gym2.socios[0].id,
      amount: 5150,
      concepto: "Cobro propio",
      paymentMethod: "cash",
      miscReason: "otro",
      idempotencyKey: claveIdempotente("misc-propio"),
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const detalle = JSON.parse(res.body).transaction as {
      id: number;
      cashRegisterId: number | null;
    };
    expect(
      await tenantDeLaFila(app, "financial_transactions", detalle.id),
      `El cobro suelto nacio en el gimnasio equivocado: el \`tenant_id\` no salio del scope ` +
        `server-side (T-168-15).`,
    ).toBe(TENANT_DOS);
    expect(
      detalle.cashRegisterId,
      `${RUTA} imputo el cobro propio a una caja que no es la del gimnasio 2 (${dos.cajaId}). ` +
        `La caja la resuelve el servidor desde la sede del cobro: si resolvio una ajena, la plata ` +
        `del gimnasio 2 entra al arqueo de El Templo.`,
    ).toBe(dos.cajaId);
  });
});

describe("cobro del plan — POST /coach-load/pay-plan (actor: COACH, rol minimo real)", () => {
  const RUTA = "POST /api/admin/finance/coach-load/pay-plan";

  it("aislamiento: no puede cobrarle el plan a un socio de El Templo, y no nace ninguna fila", async () => {
    // El socio ajeno tiene una sub ACTIVA con deuda (la siembra el beforeEach) a
    // proposito: sin ella el rechazo seria el trivial "no hay nada que renovar",
    // que no ejerce una sola linea de tenancy. Con ella, la ruta recorre
    // `renewSubscription` entero —lecturas de `subscriptions` que la fase 173
    // todavia no filtra— y el UNICO guard que corta es el de socio de
    // `TransactionService.create`. Que ese guard sea el ultimo del camino es
    // justamente por que este caso vale: es la barrera que hoy sostiene todo.
    const ledgerTemploAntes = await contarLedgerDelGimnasio(TENANT_TEMPLO);
    const ledgerDosAntes = await contarLedgerDelGimnasio(TENANT_DOS);
    const subsAntes = await contarSubsDelSocio(usuarioTemploId);

    const res = await postComoGimnasioDos(
      "/coach-load/pay-plan",
      gym2.coachToken,
      {
        userId: usuarioTemploId,
        paymentMethod: "cash",
        idempotencyKey: claveIdempotente("pay-plan-ajeno"),
      },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `le cobrara el plan al socio ${usuarioTemploId} de El Templo (que tiene una sub vigente ` +
          `con deuda de ${MONTO_DEUDA_TEMPLO})`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      JSON.parse(res.body).message,
      `${RUTA} rechazo el cobro ajeno por un motivo que NO es el guard de socio de ` +
        `TransactionService.create. Si el mensaje habla de una suscripcion que no existe, la ` +
        `siembra de la sub de El Templo se rompio y el caso paso por la razon equivocada. ` +
        `Respuesta: ${res.body}`,
    ).toContain("Miembro no encontrado");
    expect(
      [
        await contarLedgerDelGimnasio(TENANT_TEMPLO),
        await contarLedgerDelGimnasio(TENANT_DOS),
        await contarSubsDelSocio(usuarioTemploId),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `escribiera el cobro o una renovacion igual (el rechazo llego DESPUES del INSERT)`,
      ),
    ).toEqual([ledgerTemploAntes, ledgerDosAntes, subsAntes]);
  });

  it("control: SI puede cobrarle la deuda del plan a un socio propio", async () => {
    const res = await postComoGimnasioDos(
      "/coach-load/pay-plan",
      gym2.coachToken,
      {
        userId: gym2.socios[0].id,
        paymentMethod: "cash",
        idempotencyKey: claveIdempotente("pay-plan-propio"),
      },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const cuerpo = JSON.parse(res.body) as {
      transaction: { id: number; amount: number };
    };
    expect(
      cuerpo.transaction.amount,
      `${RUTA} cobro un importe distinto de la deuda sembrada (${MONTO_DEUDA_DOS}). El control ` +
        `positivo tiene que ejercer el camino "settle" completo, no un 201 vacio.`,
    ).toBe(MONTO_DEUDA_DOS);
    expect(
      await tenantDeLaFila(
        app,
        "financial_transactions",
        cuerpo.transaction.id,
      ),
      `El cobro del plan nacio en el gimnasio equivocado: el \`tenant_id\` no salio del scope ` +
        `server-side (T-168-15).`,
    ).toBe(TENANT_DOS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MOVIMIENTOS Y EGRESOS — las 4 rutas donde la plata se mueve SIN socio
//
// Actor: `gym2.adminToken`. Estas 4 viven en `finance/routes.ts`, cuyo hook de
// modulo exige FINANCE_READ_ROLES (coach EXCLUIDO) y cuyos handlers exigen
// ademas FINANCE_VOID_ROLES (owner/admin/gestion). `seedSecondTenant` no crea
// `gestion` ni `recepcion`: `admin` ES el rol minimo disponible (D-10, misma
// justificacion que el 172-18).
//
// POR QUE ESTE GRUPO ES EL MAS EXPUESTO: sus filas tienen `member_id` NULL. El
// 172-18 encontro que el aislamiento de los listados de transacciones esta
// sostenido por DOS filtros —el de la tabla y el `INNER JOIN users` con su
// propio tenantWhere—, y que sacarle uno no pone ningun test en rojo. Aca esa
// segunda barrera NO EXISTE: sin socio no hay join que filtre, y el
// `tenantWhere` de la caja (o el de la tabla) es la UNICA defensa.
//
// LA EVIDENCIA ES EL SALDO. Un rechazo que ya escribio la mitad de un asiento de
// doble entrada deja el saldo de una caja movido y el de la otra no: por eso
// cada caso compara los saldos de las cajas involucradas ANTES y DESPUES, en los
// DOS gimnasios.
// ═══════════════════════════════════════════════════════════════════════════

/** Importes propios del gimnasio 2 para los movimientos y egresos de este bloque. */
const MONTO_MOVIMIENTO_DOS = 606;
const MONTO_EGRESO_DOS = 353;

describe("movimiento inter-caja — POST /movements (actor: ADMIN, el rol minimo que este fixture puede dar)", () => {
  const RUTA = "POST /api/admin/finance/movements";

  it("aislamiento: no puede mandar plata a una caja de El Templo, y ningun saldo se mueve", async () => {
    const saldos = async () => [
      await saldoDeLaCaja(dos.cajaId),
      await saldoDeLaCaja(templo.cajaId),
    ];
    const antes = await saldos();

    const res = await postComoGimnasioDos("/movements", gym2.adminToken, {
      origenCajaId: dos.cajaId,
      destinoCajaId: templo.cajaId,
      amount: MONTO_MOVIMIENTO_DOS,
    });
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `mandara plata a la caja ${templo.cajaId} de El Templo. Es la corrupcion contable mas ` +
          `directa que existe: mueve plata sin pasar por ningun socio, asi que ningun join de ` +
          `\`users\` la frena — el filtro de la caja es la unica barrera`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await saldos(),
      porQueImportaLaEscritura(
        RUTA,
        `moviera un saldo igual. Un asiento de doble entrada escrito a medias es PEOR que uno ` +
          `completo: deja el neto del sistema distinto de cero y el arqueo de las dos cajas ` +
          `mintiendo. Saldos antes: [${antes.join(", ")}]`,
      ),
    ).toEqual(antes);
  });

  it("aislamiento: tampoco puede sacarle plata a una caja de El Templo (la combinacion inversa)", async () => {
    const saldos = async () => [
      await saldoDeLaCaja(templo.cajaId),
      await saldoDeLaCaja(dos.cajaId),
    ];
    const antes = await saldos();

    const res = await postComoGimnasioDos("/movements", gym2.adminToken, {
      origenCajaId: templo.cajaId,
      destinoCajaId: dos.cajaId,
      amount: MONTO_MOVIMIENTO_DOS,
    });
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `VACIARA una caja de El Templo hacia una propia. La direccion importa: el guard tiene que ` +
          `correr sobre las DOS cajas del asiento, no solo sobre el destino`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await saldos(),
      porQueImportaLaEscritura(
        RUTA,
        `moviera un saldo igual. Saldos antes: [${antes.join(", ")}]`,
      ),
    ).toEqual(antes);
  });

  it("control: SI puede mover plata entre DOS cajas propias, y los dos saldos se mueven", async () => {
    const origenAntes = await saldoDeLaCaja(dos.cajaId);
    const destinoAntes = await saldoDeLaCaja(cajaSecundariaDosId);

    const res = await postComoGimnasioDos("/movements", gym2.adminToken, {
      origenCajaId: dos.cajaId,
      destinoCajaId: cajaSecundariaDosId,
      amount: MONTO_MOVIMIENTO_DOS,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const movimiento = JSON.parse(res.body).movement as {
      outflowTxId: number;
      inflowTxId: number;
    };
    expect(
      [
        await tenantDeLaFila(
          app,
          "financial_transactions",
          movimiento.outflowTxId,
        ),
        await tenantDeLaFila(
          app,
          "financial_transactions",
          movimiento.inflowTxId,
        ),
      ],
      `Alguna de las dos patas del movimiento propio nacio en otro gimnasio: el \`tenant_id\` no ` +
        `salio del scope server-side (T-168-15).`,
    ).toEqual([TENANT_DOS, TENANT_DOS]);
    expect(
      [
        await saldoDeLaCaja(dos.cajaId),
        await saldoDeLaCaja(cajaSecundariaDosId),
      ],
      `${RUTA} contesto 201 pero los saldos no se movieron por ${MONTO_MOVIMIENTO_DOS}. Sin este ` +
        `control, los dos casos de aislamiento de arriba ("ningun saldo cambio") pasarian en verde ` +
        `con la ruta rota para todos: nunca cambia ningun saldo.`,
    ).toEqual([
      origenAntes - MONTO_MOVIMIENTO_DOS,
      destinoAntes + MONTO_MOVIMIENTO_DOS,
    ]);
  });
});

describe("egreso — POST /expenses (actor: ADMIN, el rol minimo que este fixture puede dar)", () => {
  const RUTA = "POST /api/admin/finance/expenses";

  it("aislamiento: no puede imputarle un egreso a un centro de costo de El Templo", async () => {
    // La caja es PROPIA y el centro de costo AJENO: el intento pasa el guard de
    // caja y llega hasta la validacion del centro, que es la que tiene que
    // cortar. El rechazo es "pedido invalido" y no "no existe" —
    // `registerExpense` trata un centro que no matchea como body invalido— y el
    // contrato se cumple igual: el mensaje es EXACTAMENTE el mismo que para un
    // centro de costo inexistente, asi que no filtra existencia (precedente del
    // 172-18 con la caja ajena de `validate`).
    const ledgerDosAntes = await contarLedgerDelGimnasio(TENANT_DOS);
    const saldoAntes = await saldoDeLaCaja(dos.cajaId);

    const res = await postComoGimnasioDos("/expenses", gym2.adminToken, {
      cajaId: dos.cajaId,
      amount: MONTO_EGRESO_DOS,
      costCenterId: templo.costCenterId,
    });
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `imputara un gasto al centro de costo ${templo.costCenterId} de El Templo`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(400);
    expect(
      [
        await contarLedgerDelGimnasio(TENANT_DOS),
        await saldoDeLaCaja(dos.cajaId),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `escribiera el egreso igual (el rechazo llego DESPUES del INSERT): el saldo de la caja ` +
          `propia se movio o aparecio una fila nueva`,
      ),
    ).toEqual([ledgerDosAntes, saldoAntes]);
  });

  it("aislamiento: tampoco puede sacarle plata a una caja de El Templo", async () => {
    const ledgerTemploAntes = await contarLedgerDelGimnasio(TENANT_TEMPLO);
    const saldoAntes = await saldoDeLaCaja(templo.cajaId);

    const res = await postComoGimnasioDos("/expenses", gym2.adminToken, {
      cajaId: templo.cajaId,
      amount: MONTO_EGRESO_DOS,
      costCenterId: dos.costCenterId,
    });
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `le restara plata a la caja ${templo.cajaId} de El Templo`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      [
        await contarLedgerDelGimnasio(TENANT_TEMPLO),
        await saldoDeLaCaja(templo.cajaId),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `le moviera el saldo a la caja ajena aunque contestara que no existe`,
      ),
    ).toEqual([ledgerTemploAntes, saldoAntes]);
  });

  it("control: SI puede registrar un egreso propio, y le baja el saldo a su caja", async () => {
    const saldoAntes = await saldoDeLaCaja(dos.cajaId);

    const res = await postComoGimnasioDos("/expenses", gym2.adminToken, {
      cajaId: dos.cajaId,
      amount: MONTO_EGRESO_DOS,
      costCenterId: dos.costCenterId,
    });
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const expenseTxId = JSON.parse(res.body).expense.expenseTxId as number;
    expect(
      await tenantDeLaFila(app, "financial_transactions", expenseTxId),
      `El egreso propio nacio en el gimnasio equivocado: el \`tenant_id\` no salio del scope ` +
        `server-side (T-168-15).`,
    ).toBe(TENANT_DOS);
    expect(
      await saldoDeLaCaja(dos.cajaId),
      `${RUTA} contesto 201 pero el saldo de la caja propia no bajo ${MONTO_EGRESO_DOS}. Sin este ` +
        `control, los dos casos de aislamiento de arriba pasarian en verde con la ruta rota para ` +
        `todos.`,
    ).toBe(saldoAntes - MONTO_EGRESO_DOS);
  });
});

describe("anulacion de movimiento — POST /movements/:id/void (actor: ADMIN, el rol minimo que este fixture puede dar)", () => {
  const RUTA = "POST /api/admin/finance/movements/:id/void";

  it("aislamiento: no puede anular un movimiento de El Templo, y las DOS patas siguen vivas", async () => {
    const saldosAntes = [
      await saldoDeLaCaja(templo.cajaId),
      await saldoDeLaCaja(templo.bankAccountId),
    ];

    const res = await postComoGimnasioDos(
      `/movements/${movTemploOutflowId}/void`,
      gym2.adminToken,
      { reason: "anulacion cross-tenant" },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `anulara el movimiento ${movTemploOutflowId} de El Templo`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);

    // Las DOS patas: `voidMovement` camina `transaction_links` para descubrir la
    // hermana, asi que una anulacion que se colara se llevaria puestas ambas — y
    // con ellas el neto cero del asiento ajeno.
    expect(
      [
        await estaAnulada(movTemploOutflowId),
        await estaAnulada(movTemploInflowId),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `anulara la fila ajena igual: el \`voided_at\` de alguna de las dos patas dejo de estar ` +
          `vacio aunque la respuesta dijera que no existe (el rechazo llego DESPUES del UPDATE)`,
      ),
    ).toEqual([false, false]);
    expect(
      [
        await saldoDeLaCaja(templo.cajaId),
        await saldoDeLaCaja(templo.bankAccountId),
      ],
      porQueImportaLaEscritura(
        RUTA,
        `le moviera el arqueo a El Templo: anular un movimiento devuelve la plata a la caja ` +
          `origen, asi que un void colado se ve en los saldos aunque las filas parezcan intactas`,
      ),
    ).toEqual(saldosAntes);
  });

  it("control: SI puede anular un movimiento propio, y las dos patas quedan anuladas", async () => {
    const alta = await postComoGimnasioDos("/movements", gym2.adminToken, {
      origenCajaId: dos.cajaId,
      destinoCajaId: cajaSecundariaDosId,
      amount: MONTO_MOVIMIENTO_DOS,
    });
    expect(
      alta.statusCode,
      `No se pudo sembrar el movimiento propio via POST /movements: ${alta.body}`,
    ).toBe(201);
    const movimiento = JSON.parse(alta.body).movement as {
      outflowTxId: number;
      inflowTxId: number;
    };
    const saldoAntes = await saldoDeLaCaja(dos.cajaId);

    const res = await postComoGimnasioDos(
      `/movements/${movimiento.outflowTxId}/void`,
      gym2.adminToken,
      { reason: "anulacion propia" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      [
        await estaAnulada(movimiento.outflowTxId),
        await estaAnulada(movimiento.inflowTxId),
      ],
      `${RUTA} contesto que anulo el movimiento propio pero alguna pata sigue viva. Sin este ` +
        `control, el caso de aislamiento de al lado ("la fila ajena sigue viva") pasaria en verde ` +
        `con la ruta rota para todos: nunca anula nada.`,
    ).toEqual([true, true]);
    expect(
      await saldoDeLaCaja(dos.cajaId),
      `${RUTA} anulo las filas pero no le devolvio la plata a la caja origen.`,
    ).toBe(saldoAntes + MONTO_MOVIMIENTO_DOS);
  });
});

describe("anulacion de egreso — POST /expenses/:id/void (actor: ADMIN, el rol minimo que este fixture puede dar)", () => {
  const RUTA = "POST /api/admin/finance/expenses/:id/void";

  it("aislamiento: no puede anular un egreso de El Templo, y el egreso ajeno sigue vivo", async () => {
    const saldoAntes = await saldoDeLaCaja(templo.cajaId);

    const res = await postComoGimnasioDos(
      `/expenses/${egresoTemploId}/void`,
      gym2.adminToken,
      { reason: "anulacion cross-tenant" },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(
        RUTA,
        `anulara el egreso ${egresoTemploId} de El Templo`,
      ) + ` Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await estaAnulada(egresoTemploId),
      porQueImportaLaEscritura(
        RUTA,
        `anulara el egreso ajeno igual: su \`voided_at\` dejo de estar vacio aunque la respuesta ` +
          `dijera que no existe`,
      ),
    ).toBe(false);
    expect(
      await saldoDeLaCaja(templo.cajaId),
      porQueImportaLaEscritura(
        RUTA,
        `le devolviera al arqueo de El Templo los ${MONTO_EGRESO_TEMPLO} del egreso anulado`,
      ),
    ).toBe(saldoAntes);
  });

  it("control: SI puede anular un egreso propio, y le devuelve la plata a su caja", async () => {
    const alta = await postComoGimnasioDos("/expenses", gym2.adminToken, {
      cajaId: dos.cajaId,
      amount: MONTO_EGRESO_DOS,
      costCenterId: dos.costCenterId,
    });
    expect(
      alta.statusCode,
      `No se pudo sembrar el egreso propio via POST /expenses: ${alta.body}`,
    ).toBe(201);
    const expenseTxId = JSON.parse(alta.body).expense.expenseTxId as number;
    const saldoAntes = await saldoDeLaCaja(dos.cajaId);

    const res = await postComoGimnasioDos(
      `/expenses/${expenseTxId}/void`,
      gym2.adminToken,
      { reason: "anulacion propia" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await estaAnulada(expenseTxId),
      `${RUTA} contesto que anulo el egreso propio pero sigue vivo. Sin este control, el caso de ` +
        `aislamiento de al lado pasaria en verde con la ruta rota para todos.`,
    ).toBe(true);
    expect(
      await saldoDeLaCaja(dos.cajaId),
      `${RUTA} anulo el egreso propio pero no le devolvio la plata a la caja.`,
    ).toBe(saldoAntes + MONTO_EGRESO_DOS);
  });
});
