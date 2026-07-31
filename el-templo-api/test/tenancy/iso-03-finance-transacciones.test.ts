/**
 * Fase 172 Plan 18 (ISO-03) — AISLAMIENTO del corazon transaccional de finance:
 * transacciones, bandeja de pendientes e historial de movimientos, ruta por
 * ruta, contra un segundo gimnasio real.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Es el segundo de los tres de la bateria ISO-03. El plan 172-17
 * (`iso-03-finance-cajas.test.ts`) cubrio las 14 rutas de cajas y centros de
 * costo; este cubre las 13 donde vive la plata que el staff toca todos los dias,
 * y el 172-19 las 11 de coach-load / movimientos / egresos.
 *
 * Este grupo es el de MAS superficie de lectura del modulo: sus listados
 * aceptan filtros libres del cliente (rango de fechas, sede, socio, medio de
 * pago, texto) y tres de sus rutas devuelven un `.xlsx` con TODO el resultado de
 * una sola vez. Un export que filtre es la fuga mas silenciosa del sistema: una
 * planilla se manda por mail sin que nadie mire fila por fila.
 *
 * QUE RUTAS CUBRE (13 de las 38 finance del manifiesto)
 * ----------------------------------------------------
 * El grupo "transacciones, bandeja e historial" de `test/tenant-manifest.ts`:
 *
 *   GET    /api/admin/finance/transactions
 *   GET    /api/admin/finance/transactions/summary
 *   GET    /api/admin/finance/transactions/export
 *   GET    /api/admin/finance/transactions/pending-misc/:memberId
 *   GET    /api/admin/finance/pending-tray
 *   GET    /api/admin/finance/pending-tray/export
 *   GET    /api/admin/finance/movements-history
 *   GET    /api/admin/finance/movements-history/export
 *   POST   /api/admin/finance/transactions
 *   POST   /api/admin/finance/transactions/:id/validate
 *   POST   /api/admin/finance/transactions/:id/observe
 *   POST   /api/admin/finance/transactions/:id/correct
 *   POST   /api/admin/finance/transactions/:id/void
 *
 * Las otras 25 estan en `iso-03-finance-cajas.test.ts` (14, plan 172-17) y
 * `iso-03-finance-coach-load.test.ts` (11, plan 172-19).
 *
 * EL CONTRATO QUE SE AFIRMA (D-09, para TODO el milestone)
 * -------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente:
 *   - listados y agregados                     → sin una sola fila ajena
 *   - GET by-id / by-socio de un recurso ajeno → 404 o lista vacia
 *   - escrituras sobre un recurso ajeno        → 404, y la fila ajena INTACTA
 *
 * **Nunca un "prohibido".** Ese status filtraria existencia ("existe pero no es
 * tuya") y exigiria la query sin scope que el sentinel prohibe. Este archivo no
 * espera ese codigo ni una sola vez, y eso es una afirmacion sobre el contrato,
 * no una omision: el criterio de aceptacion del plan es un `grep -c` de la
 * asercion de ese status sobre este archivo dando CERO.
 *
 * ⚠️ Por eso este parrafo describe el codigo en castellano en vez de escribirlo:
 * un gate que busca por substring no distingue codigo de comentario, y explicar
 * en una nota por que NO se usa una marca pone el gate en rojo igual. Es la
 * leccion que el plan 172-16 pago en `test/setup.ts` y que el 172-17 volvio a
 * pagar en su propio docblock. No lo "aclares" escribiendo el numero.
 *
 * LOS MONTOS SON DISTINGUIBLES POR GIMNASIO, Y ESO ES LA MITAD DEL ARCHIVO
 * -----------------------------------------------------------------------
 * Un agregado no devuelve filas: devuelve UN numero. "No aparece el id ajeno" no
 * se puede afirmar sobre `/transactions/summary`, asi que cada gimnasio siembra
 * un importe propio e irrepetible ({@link MONTO_UNICO_DOS} contra
 * {@link MONTO_UNICO_TEMPLO}, {@link MONTO_PENDIENTE_DOS} contra
 * {@link MONTO_PENDIENTE_TEMPLO}). Si el filtro de gimnasio falla, el total lo
 * delata: el numero esperado es exacto y el contaminado se va a los millones.
 * Los tres exports se afirman por CONTENIDO —el `.xlsx` se parsea con exceljs—
 * por el mismo motivo.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO (D-08)
 * --------------------------------------------------------
 * Un 404 o una lista vacia pueden venir del aislamiento o de una siembra rota, y
 * los dos se ven igual desde afuera. Por eso cada `describe` tiene su `it` de
 * control, que hace la MISMA operacion sobre el recurso PROPIO del gimnasio 2 y
 * exige que funcione. Sin el control, este archivo pasaria en verde con la base
 * vacia.
 *
 * LA EVIDENCIA SE LEE DE LA BASE, NO DE LA RESPUESTA HTTP
 * ------------------------------------------------------
 * Un handler que MUTE la fila ajena y despues conteste 404 daria verde mirando
 * solo el status. Por eso las escrituras releen la transaccion objetivo con
 * {@link fotoDeLaTransaccion} —gimnasio, estado de validacion, anulacion, caja
 * imputada e importe, las cinco columnas juntas— y la comparan contra su valor
 * original.
 *
 * EL ACTOR (D-10)
 * ---------------
 * `gym2.adminToken` (rol `admin`) en las 13, y es el minimo REAL disponible: 8
 * de las 13 son `FINANCE_VOID_ROLES` (owner/admin/gestion), `POST /transactions`
 * es `FINANCE_WRITE_ROLES` y el resto entra por el guard de modulo
 * `FINANCE_READ_ROLES`. En los tres conjuntos el escalon por debajo de `admin`
 * es `gestion` o `recepcion`, y `seedSecondTenant` no crea ninguno de los dos:
 * su unico otro staff es un `coach`, EXCLUIDO de los tres. El borde menos
 * privilegiado de finance lo ejerce el plan 172-19 con `gym2.coachToken` sobre
 * `/coach-load/*`.
 *
 * COMO CORRERLO
 * -------------
 * Solo este archivo: mas de uno a la vez revienta el timeout del provisioning de
 * la DB por worker en esta maquina (~100 s por archivo).
 *   pnpm exec vitest run test/tenancy/iso-03-finance-transacciones.test.ts --hookTimeout=250000
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md (lo escribe el plan 172-23)
 * @see el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts — la plantilla
 * @see .planning/phases/172-adopci-n-1-piloto-finance/172-CONTEXT.md — D-08/D-09/D-10
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
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
  campoDeLaFila,
  IMPORTE_SEMBRADO,
  MONEDA_SEMBRADA,
  type FinanzasDeElTemplo,
  type FinanzasDelGimnasioDos,
} from "../fixtures/finance-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/admin/finance";

/**
 * Fecha de TODO lo que siembra este archivo. Es la misma que usa
 * `finance-gimnasio-dos.ts`, asi que un rango que la contenga trae las dos
 * siembras y ninguna se escapa por el borde del periodo.
 */
const FECHA_SEMBRADA = "2026-01-15";

/**
 * Rango DELIBERADAMENTE ANCHO para los listados.
 *
 * Los casos de aislamiento tienen que pedir con el filtro mas permisivo que la
 * ruta acepte: un rango angosto podria estar escondiendo las filas ajenas por
 * fecha y no por gimnasio, y el test pasaria sin ejercer la capa de tenancy (es
 * el mismo razonamiento que la precondicion del pais en el 172-17).
 */
const RANGO_ANCHO = { dateFrom: "2020-01-01", dateTo: "2099-12-31" };

/**
 * Importes IRREPETIBLES por gimnasio.
 *
 * `/transactions/summary` no devuelve filas sino totales: la unica forma de
 * probar que no suma plata ajena es que el numero esperado sea exacto y que el
 * contaminado sea imposible de confundir. Los de El Templo son de otro orden de
 * magnitud a proposito — un total de siete cifras en el gimnasio 2 grita.
 */
const MONTO_UNICO_DOS = 707;
const MONTO_UNICO_TEMPLO = 9_000_009;
const MONTO_PENDIENTE_DOS = 1_313;
const MONTO_PENDIENTE_TEMPLO = 7_000_007;

/**
 * Lo que TIENE que dar `monthlyRevenue` del gimnasio 2: su asiento del fixture
 * (validado) mas su cobro unico (validado). Los pendientes NO cuentan como plata
 * firme (`firmMoneyConditions`), asi que quedan afuera por diseño.
 */
const FIRME_DEL_GIMNASIO_DOS = IMPORTE_SEMBRADO + MONTO_UNICO_DOS;

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FinanzasDeElTemplo;
let dos: FinanzasDelGimnasioDos;

/** Id del unico usuario de El Templo que sobrevive a `cleanAllTestData`. */
let usuarioTemploId: number;
/** Cobro validado con importe unico del gimnasio 2. */
let unicoDos: number;
/** Cobro validado con importe unico de El Templo (el "recurso ajeno" de plata). */
let unicoTemplo: number;
/** Cobro suelto PENDIENTE del gimnasio 2 (bandeja, pending-misc y escrituras). */
let pendienteDos: number;
/** Cobro suelto PENDIENTE de El Templo — el objetivo de los intentos ajenos. */
let pendienteTemplo: number;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmetico (copiado tal cual del 172-17):
  //  1. `cleanAllTestData` vacia ~90 tablas SIN filtro de gimnasio —incluidas
  //     `financial_transactions`, `transaction_links` y `balances`— y borra
  //     todos los users menos `admin@test.com`.
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

  // 6. Lo propio de este plan: los importes distinguibles y los pendientes.
  //    Van a mano y NO por `POST /transactions` a proposito — el fixture de una
  //    bateria de aislamiento no puede depender del mismo camino de escritura
  //    que la bateria pone a prueba (misma razon que `sembrarElAsiento`).
  usuarioTemploId = await idDelAdminSemilla();
  unicoDos = await sembrarTransaccion({
    tenantId: TENANT_DOS,
    memberId: gym2.socios[0].id,
    recordedBy: gym2.adminId,
    branchId: gym2.branchId,
    cashRegisterId: dos.cajaId,
    amount: MONTO_UNICO_DOS,
    kind: "plan_charge",
    validationStatus: "validado",
  });
  pendienteDos = await sembrarTransaccion({
    tenantId: TENANT_DOS,
    memberId: gym2.socios[0].id,
    recordedBy: gym2.adminId,
    branchId: gym2.branchId,
    cashRegisterId: dos.cajaId,
    amount: MONTO_PENDIENTE_DOS,
    kind: "advance_payment",
    validationStatus: "pendiente",
  });
  unicoTemplo = await sembrarTransaccion({
    tenantId: TENANT_TEMPLO,
    memberId: usuarioTemploId,
    recordedBy: usuarioTemploId,
    branchId: templo.branchId,
    cashRegisterId: templo.cajaId,
    amount: MONTO_UNICO_TEMPLO,
    kind: "plan_charge",
    validationStatus: "validado",
  });
  pendienteTemplo = await sembrarTransaccion({
    tenantId: TENANT_TEMPLO,
    memberId: usuarioTemploId,
    recordedBy: usuarioTemploId,
    branchId: templo.branchId,
    cashRegisterId: templo.cajaId,
    amount: MONTO_PENDIENTE_TEMPLO,
    kind: "advance_payment",
    validationStatus: "pendiente",
  });
});

afterAll(async () => {
  // Obligatorio: la base la comparten todos los archivos del mismo worker
  // (`isolate: false`), `branches` no esta en `TABLES_TO_CLEAN` y `cost_centers`
  // tampoco — sin esto, la sede y los catalogos del gimnasio 2 se filtran al
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
 * Juega el papel de "el socio del otro gimnasio" en los casos de
 * `pending-misc/:memberId`: despues de `cleanAllTestData` es el UNICO usuario de
 * El Templo que queda vivo, y `financial_transactions.member_id` no distingue
 * socios de staff.
 */
async function idDelAdminSemilla(): Promise<number> {
  const [fila] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, { tenantId: TENANT_TEMPLO }),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  if (!fila) {
    throw new Error(
      "No existe admin@test.com en El Templo. Ese usuario lo siembra test/setup.ts y es el " +
        "unico que sobrevive a cleanAllTestData: sin el no hay `recorded_by` valido para las " +
        "transacciones ajenas de este archivo.",
    );
  }
  return fila.id;
}

/**
 * Un cobro sembrado a mano, con gimnasio EXPLICITO.
 *
 * `tenant_id` tiene DEFAULT 1 desde la fase 167: un INSERT que omita la columna
 * siembra en El Templo sin avisar y la siembra MIENTE (T-168-15). Por eso pasa
 * por `tenantValues` y por eso las precondiciones releen el gimnasio de cada
 * fila desde la base.
 */
async function sembrarTransaccion(datos: {
  tenantId: number;
  memberId: number;
  recordedBy: number;
  branchId: number;
  cashRegisterId: number;
  amount: number;
  kind: "plan_charge" | "advance_payment";
  validationStatus: "validado" | "pendiente";
}): Promise<number> {
  const [fila] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(
        { tenantId: datos.tenantId },
        {
          memberId: datos.memberId,
          kind: datos.kind,
          direction: "inflow",
          amount: datos.amount,
          currency: MONEDA_SEMBRADA,
          paymentMethod: "cash",
          transactionDate: FECHA_SEMBRADA,
          effectiveDate: FECHA_SEMBRADA,
          branchId: datos.branchId,
          cashRegisterId: datos.cashRegisterId,
          recordedBy: datos.recordedBy,
          validationStatus: datos.validationStatus,
        },
      ),
    )
    .$returningId();
  return fila.id;
}

// ─── Utilidades de request ───────────────────────────────────────────────────

/** GET como staff del gimnasio 2. */
async function getComoGimnasioDos(url: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
  });
}

/** POST como staff del gimnasio 2. */
async function postComoGimnasioDos(
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Querystring del rango ancho, listo para pegar. */
function rangoAncho(extra = ""): string {
  return `dateFrom=${RANGO_ANCHO.dateFrom}&dateTo=${RANGO_ANCHO.dateTo}${extra}`;
}

// ─── Evidencia leida de la BASE ──────────────────────────────────────────────

/**
 * Normaliza la salida de `app.db.execute`, que devuelve `[filas, metadata]` en
 * mysql2 y a veces las filas peladas. Mismo molde que
 * `test/fixtures/finance-gimnasio-dos.ts`.
 */
async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/** Las cinco columnas que definen el estado de una transaccion. */
interface FotoDeLaTransaccion {
  tenantId: number | null;
  validationStatus: string | null;
  anulada: boolean;
  cashRegisterId: number | null;
  amount: number | null;
}

/**
 * Foto de una transaccion leida DE LA BASE, por id y sin filtrar por gimnasio.
 *
 * `campoDeLaFila` del fixture lee UNA columna; una transaccion necesita cinco
 * juntas para que el rojo de un intento de escritura ajena sea legible de una
 * sola mirada (que gimnasio, que estado, si la anularon, a que caja quedo
 * imputada y por cuanto). Devuelve `tenantId: null` cuando la fila no existe,
 * para que un id equivocado se distinga de un gimnasio equivocado.
 *
 * Fase 172: `financial_transactions` es tabla strict, asi que este SELECT hace
 * throw sin anotacion. La exencion `tenant-safe:` va EMBEBIDA en el SQL (unico
 * canal que el sentinel lee) y es la salida CORRECTA, no un escape: filtrar por
 * `tenant_id` aca volveria la asercion TAUTOLOGICA — la pregunta es "¿de que
 * gimnasio sigue siendo esta fila y sigue como estaba?" y una query que ya asume
 * la respuesta no prueba nada. Mismo razonamiento y misma redaccion que
 * `tenantDeLaFila` (decision 2 del 172-16).
 */
async function fotoDeLaTransaccion(id: number): Promise<FotoDeLaTransaccion> {
  const filas = await consultar<{
    tenant_id: number | null;
    validation_status: string | null;
    voided_at: unknown;
    cash_register_id: number | null;
    amount: number | null;
  }>(
    sql`SELECT /* tenant-safe: releer la fila AJENA es la asercion de tampering; filtrarla por gimnasio la volveria tautologica */ tenant_id, validation_status, voided_at, cash_register_id, amount FROM financial_transactions WHERE id = ${id}`,
  );
  const fila = filas[0];
  if (fila === undefined) {
    return {
      tenantId: null,
      validationStatus: null,
      anulada: false,
      cashRegisterId: null,
      amount: null,
    };
  }
  return {
    tenantId: fila.tenant_id === null ? null : Number(fila.tenant_id),
    validationStatus: fila.validation_status,
    anulada: fila.voided_at !== null,
    cashRegisterId:
      fila.cash_register_id === null ? null : Number(fila.cash_register_id),
    amount: fila.amount === null ? null : Number(fila.amount),
  };
}

/** Cuantas transacciones tiene un gimnasio, ahora mismo. */
async function contarTransacciones(tenantId: number): Promise<number> {
  const filas = await app.db
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(tenantWhere(schema.financialTransactions, { tenantId }));
  return filas.length;
}

/** Nombre de una sede, leido con el gimnasio en el filtro. */
async function nombreDeLaSede(
  tenantId: number,
  branchId: number,
): Promise<string> {
  const [fila] = await app.db
    .select({ name: schema.branches.name })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, { tenantId }),
        eq(schema.branches.id, branchId),
      ),
    )
    .limit(1);
  if (!fila) {
    throw new Error(
      `La sede ${branchId} del gimnasio ${tenantId} no existe: la siembra se rompio y los ` +
        `casos que comparan nombres de sede pasarian sin comparar nada.`,
    );
  }
  return fila.name;
}

// ─── Mensajes de rojo ────────────────────────────────────────────────────────

/**
 * Mensaje compartido de los rojos de AISLAMIENTO en listados.
 *
 * Nombra el gimnasio de la fila filtrada, porque un `expected 90671 to be …`
 * pelado no le dice a nadie que se acaba de abrir un agujero entre gimnasios.
 */
function porQueImportaElListado(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} la transaccion ${filaId}, que NO es ` +
    `suya. Eso es una fuga de plata entre gimnasios (T-172-18-01): al listado le falta su ` +
    `\`tenantWhere(financialTransactions, ctx)\`, o el \`ctx\` no salio de ` +
    `\`assertTenant(request.scope, …)\`. Empezar por el metodo que sirve esa ruta en ` +
    `src/modules/finance/transaction-service.ts y por su handler en ` +
    `src/modules/finance/routes.ts. NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de CONTROL POSITIVO. */
function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le devolvio al staff del gimnasio ${TENANT_DOS} su PROPIA fila ${filaId}. ` +
    `Esto no es un problema de aislamiento sino de siembra o de scope de mas: sin este control, ` +
    `el caso de aislamiento de al lado pasaria en verde por la razon equivocada (una base vacia ` +
    `tambien "no filtra nada"). Revisar la siembra de este archivo y el filtro de pais/sede/caja ` +
    `de la ruta antes de tocar la capa de tenancy.`
  );
}

/** Mensaje compartido de los rojos de los EXPORTS. */
function porQueImportaElExport(ruta: string, dato: string): string {
  return (
    `${ruta} metio "${dato}" —que es del gimnasio ${TENANT_TEMPLO}— en la planilla que descargo ` +
    `el staff del gimnasio ${TENANT_DOS}. El export es el vector mas silencioso de fuga masiva: ` +
    `sale por mail y nadie lo mira fila por fila. Mirar el metodo del service que arma las filas ` +
    `(exportRowsForExcel / listPendingTray / listMovEgresos) — el handler solo formatea.`
  );
}

/**
 * Afirma que TODAS las transacciones que la ruta devolvio son del gimnasio 2,
 * leyendo el `tenant_id` de cada una DE LA BASE.
 *
 * Es mas fuerte que "no aparece el id que sembre en El Templo": caza tambien las
 * filas ajenas que este archivo no sembro.
 */
async function afirmarQueTodasSonDelGimnasioDos(
  ruta: string,
  ids: number[],
): Promise<void> {
  for (const id of ids) {
    expect(
      await tenantDeLaFila(app, "financial_transactions", id),
      porQueImportaElListado(ruta, id),
    ).toBe(TENANT_DOS);
  }
}

// ─── Lectura de los exports (.xlsx parseado) ─────────────────────────────────

/**
 * Descarga un export como staff del gimnasio 2 y devuelve sus filas de datos
 * (sin encabezado) como texto, columna por columna.
 *
 * Los exports son binarios: se PARSEAN. Mirar solo el status code dejaria a las
 * tres rutas que mas datos entregan de una sola vez sin una sola asercion de
 * contenido — y son justo las que un aislamiento roto convierte en una fuga
 * masiva.
 */
async function filasDelExport(
  url: string,
  hoja: string,
  columnas: number,
): Promise<string[][]> {
  const res = await getComoGimnasioDos(url);
  expect(res.statusCode, `GET ${BASE}${url} fallo: ${res.body}`).toBe(200);
  const wb = new Workbook();
  // `res.rawPayload` es un Buffer de Node; el tipo Buffer que exceljs empaqueta
  // no es el mismo nominal (precedente: test/reports/outstanding-balances.test.ts).
  await wb.xlsx.load(
    res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  const sheet = wb.getWorksheet(hoja);
  expect(sheet, `El export ${url} no trajo la hoja "${hoja}"`).toBeDefined();
  const filas: string[][] = [];
  sheet?.eachRow((row, i) => {
    if (i === 1) return; // encabezado
    // Se lee por INDICE fijo y no con `eachCell`: `eachCell` saltea las celdas
    // vacias y correria las columnas, comparando la columna equivocada.
    filas.push(
      Array.from({ length: columnas }, (_, c) =>
        String(row.getCell(c + 1).value ?? ""),
      ),
    );
  });
  return filas;
}

/** Una columna del export (1-based, como en la planilla). */
function columna(filas: string[][], indice: number): string[] {
  return filas.map((f) => f[indice - 1]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // `list`, `getSummary`, `listPendingTray` y `listMovEgresos` filtran por
    // pais ademas de por gimnasio (el non-owner queda clavado a
    // `scope.country`). Si la sede del gimnasio 2 fuera ES y la de El Templo AR,
    // TODOS los casos de aislamiento de abajo pasarian en verde sin que la capa
    // de tenancy hiciera absolutamente nada.
    const paisDos = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_DOS }),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    const paisTemplo = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, { tenantId: TENANT_TEMPLO }),
          eq(schema.branches.id, templo.branchId),
        ),
      );
    expect(
      [paisDos[0]?.country, paisTemplo[0]?.country],
      `Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO aisla; ` +
        `con paises distintos el filtro de country escondaria las filas ajenas igual y los casos ` +
        `de abajo pasarian sin ejercer la capa de tenancy. Arreglo: que las dos sedes vuelvan a ` +
        `ser AR (test/fixtures/second-tenant.ts y test/setup.ts), NO relajar estas aserciones.`,
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene plata viva que el gimnasio 2 NO tiene que ver", async () => {
    // Precondicion, no decoracion: si la siembra de El Templo fallara, "el
    // gimnasio 2 no ve nada ajeno" seria trivialmente cierto.
    expect(
      [
        await tenantDeLaFila(
          app,
          "financial_transactions",
          templo.transactionId,
        ),
        await tenantDeLaFila(app, "financial_transactions", unicoTemplo),
        await tenantDeLaFila(app, "financial_transactions", pendienteTemplo),
      ],
      `Alguna transaccion ajena no quedo en El Templo (${TENANT_TEMPLO}). Sin recurso ajeno vivo, ` +
        `todos los casos de aislamiento de este archivo pasan probando nada.`,
    ).toEqual([TENANT_TEMPLO, TENANT_TEMPLO, TENANT_TEMPLO]);
  });

  it("el gimnasio 2 tiene plata propia, sembrada en el gimnasio 2", async () => {
    expect(
      [
        await tenantDeLaFila(app, "financial_transactions", dos.transactionId),
        await tenantDeLaFila(app, "transaction_links", dos.linkId),
        await tenantDeLaFila(app, "balances", dos.balanceId),
        await tenantDeLaFila(app, "financial_transactions", unicoDos),
        await tenantDeLaFila(app, "financial_transactions", pendienteDos),
      ],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ese ` +
        `INSERT perdio su \`tenantValues\` y cayo en el DEFAULT 1 de la columna (T-168-15): el ` +
        `"segundo gimnasio" seria en realidad El Templo y TODOS los controles positivos de abajo ` +
        `estarian mirando datos de El Templo.`,
    ).toEqual([TENANT_DOS, TENANT_DOS, TENANT_DOS, TENANT_DOS, TENANT_DOS]);
  });

  it("los importes de los dos gimnasios son distinguibles: un total contaminado no se puede confundir", async () => {
    // Es LA precondicion de `/transactions/summary` y de los tres exports: un
    // agregado no devuelve ids, devuelve un numero. Si los dos gimnasios
    // tuvieran los mismos importes, un total que sume los dos seria
    // indistinguible del correcto en varios de los casos de abajo.
    const importes = [
      MONTO_UNICO_DOS,
      MONTO_PENDIENTE_DOS,
      MONTO_UNICO_TEMPLO,
      MONTO_PENDIENTE_TEMPLO,
      IMPORTE_SEMBRADO,
    ];
    expect(
      new Set(importes).size,
      `Dos importes sembrados coincidieron (${importes.join(", ")}). Con importes repetidos, un ` +
        `total que sume plata ajena puede dar el mismo numero que el correcto y las aserciones de ` +
        `\`/transactions/summary\` y de los exports dejan de morder. Cambiar el importe repetido, ` +
        `NO relajar la asercion.`,
    ).toBe(importes.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LECTURAS — 7 rutas GET (la octava, el export del historial, va con las
// escrituras mas abajo)
// ═══════════════════════════════════════════════════════════════════════════

describe("listado de transacciones — GET /api/admin/finance/transactions", () => {
  const RUTA = "GET /api/admin/finance/transactions";

  it("aislamiento: con el rango mas ancho que acepta, no devuelve ni una transaccion de El Templo", async () => {
    const res = await getComoGimnasioDos(
      `/transactions?${rangoAncho("&limit=200")}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const rows = JSON.parse(res.body).rows as Array<{ id: number }>;

    // Los ids sembrados, nombrados explicitamente para que el rojo sea legible…
    for (const ajena of [templo.transactionId, unicoTemplo, pendienteTemplo]) {
      expect(
        rows.map((r) => r.id),
        porQueImportaElListado(RUTA, ajena),
      ).not.toContain(ajena);
    }
    // …y el barrido completo, que ademas cazaria filas ajenas que este archivo
    // no sembro.
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      rows.map((r) => r.id),
    );
  });

  it("control: SI devuelve sus propias transacciones, y el total cuenta solo las suyas", async () => {
    const res = await getComoGimnasioDos(
      `/transactions?${rangoAncho("&limit=200")}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      rows: Array<{ id: number; amount: number }>;
      total: number;
    };

    for (const propia of [dos.transactionId, unicoDos, pendienteDos]) {
      expect(
        cuerpo.rows.map((r) => r.id),
        porQueImportaElControl(RUTA, propia),
      ).toContain(propia);
    }
    // El COUNT es OTRA query que la de las filas: si el filtro de gimnasio
    // viviera en una sola de las dos, el staff veria 3 filas y un total de 6.
    expect(
      cuerpo.total,
      `${RUTA} devolvio un total de ${cuerpo.total} para el gimnasio ${TENANT_DOS}, que tiene ` +
        `exactamente 3 transacciones. Si es 6, el COUNT perdio el filtro de gimnasio que si tiene ` +
        `la query de filas (los dos salen del mismo array \`conditions\` justamente para que esto ` +
        `no pueda pasar).`,
    ).toBe(3);
  });
});

describe("resumen de la caja — GET /api/admin/finance/transactions/summary", () => {
  const RUTA = "GET /api/admin/finance/transactions/summary";

  it("aislamiento: el total facturado es EXACTAMENTE el del gimnasio 2", async () => {
    const res = await getComoGimnasioDos(
      `/transactions/summary?${rangoAncho()}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const resumen = JSON.parse(res.body) as {
      monthlyRevenue: number;
      revenueByMethod: Record<string, number>;
      revenueByBranch: Array<{ branchId: number; branchName: string }>;
    };

    expect(
      resumen.monthlyRevenue,
      `El total facturado del gimnasio ${TENANT_DOS} no es ${FIRME_DEL_GIMNASIO_DOS}. Este es el ` +
        `caso que no puede apoyarse en ids: un resumen devuelve UN numero. Si el valor se fue a ` +
        `los millones, esta sumando los ${MONTO_UNICO_TEMPLO} de El Templo y le falta el ` +
        `\`tenantWhere\` a alguna de las 4 agregaciones de \`getSummary\` ` +
        `(src/modules/finance/transaction-service.ts). Si es 0, la siembra propia se rompio.`,
    ).toBe(FIRME_DEL_GIMNASIO_DOS);

    // Las 4 agregaciones comparten el array `conds`, pero cada una corre su
    // propia query: el desglose por medio de pago se afirma aparte porque un
    // filtro que viviera solo en el total dejaria la tarjeta de "Efectivo"
    // mostrando plata ajena.
    expect(
      resumen.revenueByMethod.cash,
      `El desglose por medio de pago del gimnasio ${TENANT_DOS} no coincide con su total. Si el ` +
        `numero es distinto del de \`monthlyRevenue\`, el filtro de gimnasio esta en unas ` +
        `agregaciones y no en otras — y las tarjetas de la CajaPage dejan de sumar entre si.`,
    ).toBe(FIRME_DEL_GIMNASIO_DOS);

    expect(
      resumen.revenueByBranch.map((b) => b.branchId),
      porQueImportaElListado(RUTA, templo.branchId) +
        ` (aca la fila filtrada es una SEDE ajena en el desglose por sucursal)`,
    ).not.toContain(templo.branchId);
  });

  it("control: la sede propia aparece en el desglose, con su plata", async () => {
    const res = await getComoGimnasioDos(
      `/transactions/summary?${rangoAncho()}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const resumen = JSON.parse(res.body) as {
      revenueByBranch: Array<{ branchId: number; revenue: number }>;
    };
    const propia = resumen.revenueByBranch.find(
      (b) => b.branchId === gym2.branchId,
    );
    expect(
      propia,
      porQueImportaElControl(RUTA, gym2.branchId) +
        ` Sin este control, el caso de aislamiento de al lado podria estar dando 0 = 0 con la ` +
        `agregacion rota para todos.`,
    ).toBeDefined();
    expect(
      propia?.revenue,
      `${RUTA} devolvio la sede propia con otra plata que la sembrada.`,
    ).toBe(FIRME_DEL_GIMNASIO_DOS);
  });
});

describe("export de transacciones — GET /api/admin/finance/transactions/export", () => {
  const RUTA = "GET /api/admin/finance/transactions/export";
  /** Columnas de la hoja "Caja" (D-15): el orden es load-bearing. */
  const COL_MONTO = 3;
  const COL_SUCURSAL = 6;
  const COLUMNAS = 11;

  it("aislamiento: el .xlsx no trae ni un importe ni una sede de El Templo", async () => {
    const sedeAjena = await nombreDeLaSede(TENANT_TEMPLO, templo.branchId);
    const filas = await filasDelExport(
      `/transactions/export?${rangoAncho()}`,
      "Caja",
      COLUMNAS,
    );

    for (const ajeno of [MONTO_UNICO_TEMPLO, MONTO_PENDIENTE_TEMPLO]) {
      expect(
        columna(filas, COL_MONTO),
        porQueImportaElExport(RUTA, `un cobro de ${ajeno}`),
      ).not.toContain(String(ajeno));
    }
    expect(
      columna(filas, COL_SUCURSAL),
      porQueImportaElExport(RUTA, sedeAjena),
    ).not.toContain(sedeAjena);
  });

  it("control: el .xlsx SI trae los cobros del gimnasio 2, con su sede", async () => {
    const sedePropia = await nombreDeLaSede(TENANT_DOS, gym2.branchId);
    const filas = await filasDelExport(
      `/transactions/export?${rangoAncho()}`,
      "Caja",
      COLUMNAS,
    );

    expect(
      columna(filas, COL_MONTO),
      porQueImportaElControl(RUTA, unicoDos) +
        ` (el importe propio ${MONTO_UNICO_DOS} no aparece en la planilla)`,
    ).toContain(String(MONTO_UNICO_DOS));
    expect(
      columna(filas, COL_SUCURSAL),
      porQueImportaElControl(RUTA, gym2.branchId) +
        ` (la sede propia "${sedePropia}" no aparece en la planilla)`,
    ).toContain(sedePropia);
  });
});

describe("cobros sueltos de un socio — GET /api/admin/finance/transactions/pending-misc/:memberId", () => {
  const RUTA = "GET /api/admin/finance/transactions/pending-misc/:memberId";

  it("aislamiento: pidiendo por un socio de El Templo no devuelve un solo cobro suyo", async () => {
    // Es la unica ruta del grupo donde el id AJENO viaja en la URL: el staff del
    // gimnasio 2 elige a quien mirarle los cobros sueltos. El contrato D-09 acá
    // se cumple con lista vacia — el socio ajeno tiene que ser indistinguible de
    // uno que no existe.
    const res = await getComoGimnasioDos(
      `/transactions/pending-misc/${usuarioTemploId}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const items = JSON.parse(res.body).items as Array<{ id: number }>;

    expect(
      items.map((i) => i.id),
      porQueImportaElListado(RUTA, pendienteTemplo) +
        ` (el id pedido en la URL era el de un usuario de El Templo: ${usuarioTemploId})`,
    ).toEqual([]);
  });

  it("control: pidiendo por su propio socio SI devuelve el cobro suelto pendiente", async () => {
    const res = await getComoGimnasioDos(
      `/transactions/pending-misc/${gym2.socios[0].id}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const items = JSON.parse(res.body).items as Array<{
      id: number;
      amount: number;
    }>;
    expect(
      items.map((i) => i.id),
      porQueImportaElControl(RUTA, pendienteDos),
    ).toContain(pendienteDos);
    expect(
      items.find((i) => i.id === pendienteDos)?.amount,
      `${RUTA} devolvio el cobro propio con otro importe que el sembrado.`,
    ).toBe(MONTO_PENDIENTE_DOS);
  });
});

describe("bandeja de pendientes — GET /api/admin/finance/pending-tray", () => {
  const RUTA = "GET /api/admin/finance/pending-tray";

  it("aislamiento: no devuelve ni un pendiente de El Templo, ni en las filas ni en el contador", async () => {
    const res = await getComoGimnasioDos(
      `/pending-tray?status=todos&${rangoAncho("&limit=200")}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      rows: Array<{ id: number }>;
      total: number;
    };

    expect(
      cuerpo.rows.map((r) => r.id),
      porQueImportaElListado(RUTA, pendienteTemplo),
    ).not.toContain(pendienteTemplo);
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      cuerpo.rows.map((r) => r.id),
    );
    // El contador de la bandeja es lo primero que mira el staff (y lo que
    // dispara la alerta de vencidos): sale de una query aparte de la de filas.
    expect(
      cuerpo.total,
      `La bandeja del gimnasio ${TENANT_DOS} conto ${cuerpo.total} pendientes y tiene 1. Si es 2, ` +
        `el COUNT esta viendo el pendiente de El Templo aunque las filas no lo muestren: el ` +
        `filtro de gimnasio quedo en una sola de las dos queries de \`listPendingTray\`.`,
    ).toBe(1);
  });

  it("control: SI devuelve su propio pendiente, con su importe", async () => {
    const res = await getComoGimnasioDos(
      `/pending-tray?status=todos&${rangoAncho("&limit=200")}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const rows = JSON.parse(res.body).rows as Array<{
      id: number;
      amount: number;
    }>;
    expect(
      rows.map((r) => r.id),
      porQueImportaElControl(RUTA, pendienteDos),
    ).toContain(pendienteDos);
    expect(
      rows.find((r) => r.id === pendienteDos)?.amount,
      `${RUTA} devolvio el pendiente propio con otro importe que el sembrado.`,
    ).toBe(MONTO_PENDIENTE_DOS);
  });
});

describe("export de la bandeja — GET /api/admin/finance/pending-tray/export", () => {
  const RUTA = "GET /api/admin/finance/pending-tray/export";
  /** Columnas de la hoja "Bandeja". */
  const COL_MONTO = 3;
  const COL_CAJA = 6;
  const COLUMNAS = 10;

  it("aislamiento: el .xlsx no trae ni el importe ni la caja del pendiente ajeno", async () => {
    const cajaAjena = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      templo.cajaId,
    );
    const filas = await filasDelExport(
      `/pending-tray/export?status=todos&${rangoAncho()}`,
      "Bandeja",
      COLUMNAS,
    );

    expect(
      columna(filas, COL_MONTO),
      porQueImportaElExport(RUTA, `un pendiente de ${MONTO_PENDIENTE_TEMPLO}`),
    ).not.toContain(String(MONTO_PENDIENTE_TEMPLO));
    expect(
      columna(filas, COL_CAJA),
      porQueImportaElExport(RUTA, `la caja "${cajaAjena}"`),
    ).not.toContain(cajaAjena);
  });

  it("control: el .xlsx SI trae el pendiente propio, imputado a la caja propia", async () => {
    const cajaPropia = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      dos.cajaId,
    );
    const filas = await filasDelExport(
      `/pending-tray/export?status=todos&${rangoAncho()}`,
      "Bandeja",
      COLUMNAS,
    );

    expect(
      columna(filas, COL_MONTO),
      porQueImportaElControl(RUTA, pendienteDos) +
        ` (el importe propio ${MONTO_PENDIENTE_DOS} no aparece en la planilla)`,
    ).toContain(String(MONTO_PENDIENTE_DOS));
    expect(
      columna(filas, COL_CAJA),
      porQueImportaElControl(RUTA, dos.cajaId) +
        ` (la caja propia "${cajaPropia}" no aparece en la planilla)`,
    ).toContain(cajaPropia);
  });
});

describe("historial de movimientos (arqueo por caja) — GET /api/admin/finance/movements-history", () => {
  const RUTA = "GET /api/admin/finance/movements-history";

  it("aislamiento: no devuelve ni una fila imputada a una caja de El Templo", async () => {
    const res = await getComoGimnasioDos(
      `/movements-history?${rangoAncho("&limit=200")}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      rows: Array<{ id: number; cashRegisterId: number | null }>;
      total: number;
    };

    for (const ajena of [templo.transactionId, unicoTemplo, pendienteTemplo]) {
      expect(
        cuerpo.rows.map((r) => r.id),
        porQueImportaElListado(RUTA, ajena),
      ).not.toContain(ajena);
    }
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      cuerpo.rows.map((r) => r.id),
    );
    // El arqueo es POR CAJA: una fila imputada a una caja ajena delata el
    // movimiento de plata del otro gimnasio aunque su transaccion no se muestre.
    expect(
      cuerpo.rows.map((r) => r.cashRegisterId),
      porQueImportaElListado(RUTA, templo.cajaId) +
        ` (aca la fuga es la CAJA imputada: el subquery de cajas del pais tiene que llevar su ` +
        `propio filtro de gimnasio, si no el IN deja entrar las del vecino)`,
    ).not.toContain(templo.cajaId);
  });

  it("control: SI devuelve el movimiento propio, imputado a su caja", async () => {
    const res = await getComoGimnasioDos(
      `/movements-history?${rangoAncho("&limit=200")}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const cuerpo = JSON.parse(res.body) as {
      rows: Array<{ id: number; cashRegisterId: number | null }>;
      total: number;
    };
    expect(
      cuerpo.rows.map((r) => r.id),
      porQueImportaElControl(RUTA, dos.transactionId),
    ).toContain(dos.transactionId);
    expect(
      cuerpo.rows.find((r) => r.id === dos.transactionId)?.cashRegisterId,
      `${RUTA} devolvio la fila propia sin su caja: el arqueo del gimnasio 2 quedaria vacio y el ` +
        `caso de aislamiento de al lado pasaria por la razon equivocada.`,
    ).toBe(dos.cajaId);
    expect(
      cuerpo.total,
      `El arqueo del gimnasio ${TENANT_DOS} conto ${cuerpo.total} filas y tiene 3. Si es 6, el ` +
        `COUNT de \`listMovEgresos\` esta contando las de El Templo.`,
    ).toBe(3);
  });
});

describe("export del historial — GET /api/admin/finance/movements-history/export", () => {
  const RUTA = "GET /api/admin/finance/movements-history/export";
  /** Columnas de la hoja "Mov-Egresos". */
  const COL_MONTO = 5;
  const COL_CAJA = 7;
  const COLUMNAS = 10;

  it("aislamiento: el .xlsx del arqueo no trae ni un importe ni una caja de El Templo", async () => {
    const cajaAjena = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      templo.cajaId,
    );
    const filas = await filasDelExport(
      `/movements-history/export?${rangoAncho()}`,
      "Mov-Egresos",
      COLUMNAS,
    );

    for (const ajeno of [MONTO_UNICO_TEMPLO, MONTO_PENDIENTE_TEMPLO]) {
      expect(
        columna(filas, COL_MONTO),
        porQueImportaElExport(RUTA, `un movimiento de ${ajeno}`),
      ).not.toContain(String(ajeno));
    }
    expect(
      columna(filas, COL_CAJA),
      porQueImportaElExport(RUTA, `la caja "${cajaAjena}"`),
    ).not.toContain(cajaAjena);
  });

  it("control: el .xlsx SI trae los movimientos propios, con la caja propia", async () => {
    const cajaPropia = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      dos.cajaId,
    );
    const filas = await filasDelExport(
      `/movements-history/export?${rangoAncho()}`,
      "Mov-Egresos",
      COLUMNAS,
    );

    expect(
      columna(filas, COL_MONTO),
      porQueImportaElControl(RUTA, unicoDos) +
        ` (el importe propio ${MONTO_UNICO_DOS} no aparece en la planilla)`,
    ).toContain(String(MONTO_UNICO_DOS));
    expect(
      columna(filas, COL_CAJA),
      porQueImportaElControl(RUTA, dos.cajaId) +
        ` (la caja propia "${cajaPropia}" no aparece en la planilla)`,
    ).toContain(cajaPropia);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITURAS — las 5 rutas POST del grupo
//
// El status por si solo NO alcanza: un handler que MUTE la transaccion ajena y
// despues conteste "no existe" daria verde mirando nada mas la respuesta. Por
// eso cada caso de aislamiento releé la transaccion objetivo con
// `fotoDeLaTransaccion` —las cinco columnas de una vez— y la compara contra su
// estado original (T-172-18-02).
// ═══════════════════════════════════════════════════════════════════════════

/** Importe del cobro que crea el control positivo de `POST /transactions`. */
const MONTO_COBRO_NUEVO = 4_242;
/** Importe al que corrige el control positivo de `/correct`. */
const MONTO_CORREGIDO = 2_121;

/** Mensaje compartido de los rojos de AISLAMIENTO en escrituras. */
function porQueImportaLaEscritura(ruta: string, filaId: number): string {
  return (
    `${ruta} dejo que el staff del gimnasio ${TENANT_DOS} operara sobre la transaccion ${filaId}, ` +
    `que es de El Templo (${TENANT_TEMPLO}). Eso es TAMPERING cross-tenant sobre PLATA ` +
    `(T-172-18-02): al UPDATE le falta su \`tenantWhere(financialTransactions, ctx)\`, o el ` +
    `SELECT previo del metodo (validate / observe / correct / _void en ` +
    `src/modules/finance/transaction-service.ts) dejo de filtrar por gimnasio. El contrato del ` +
    `milestone (D-09) es que el recurso ajeno sea indistinguible de uno inexistente: "no existe", ` +
    `nunca "prohibido".`
  );
}

/**
 * Afirma que la transaccion AJENA sigue siendo de El Templo y con las cinco
 * columnas como estaban.
 *
 * Las dos mitades importan: el gimnasio (nadie se robo la fila) y el estado
 * (nadie la valido, la observo, la corrigio ni la anulo antes de contestar que
 * no existe).
 */
async function afirmarTransaccionAjenaIntacta(
  ruta: string,
  filaId: number,
  esperada: Omit<FotoDeLaTransaccion, "tenantId">,
): Promise<void> {
  expect(
    await fotoDeLaTransaccion(filaId),
    porQueImportaLaEscritura(ruta, filaId) +
      ` La foto de la fila ajena (gimnasio, estado, anulacion, caja imputada e importe) tiene que ` +
      `ser IDENTICA a la de antes del intento: si el status HTTP dice "no existe" pero alguna de ` +
      `esas columnas cambio, el 404 llego DESPUES de la escritura — y mirar solo el status es ` +
      `exactamente la evidencia que este archivo no acepta.`,
  ).toEqual({ tenantId: TENANT_TEMPLO, ...esperada });
}

/** Cuerpo valido de alta de cobro, con lo que cada caso quiera pisar. */
function cobroDelGimnasioDos(pisar: Record<string, unknown>) {
  return {
    memberId: gym2.socios[0].id,
    kind: "advance_payment",
    direction: "inflow",
    amount: MONTO_COBRO_NUEVO,
    currency: MONEDA_SEMBRADA,
    paymentMethod: "cash",
    transactionDate: FECHA_SEMBRADA,
    effectiveDate: FECHA_SEMBRADA,
    branchId: gym2.branchId,
    links: [] as Array<Record<string, unknown>>,
    ...pisar,
  };
}

describe("alta de cobro — POST /api/admin/finance/transactions", () => {
  const RUTA = "POST /api/admin/finance/transactions";

  it("aislamiento: no puede cobrarle a un socio de El Templo, y no nace ninguna transaccion", async () => {
    const antesDos = await contarTransacciones(TENANT_DOS);
    const antesTemplo = await contarTransacciones(TENANT_TEMPLO);

    const res = await postComoGimnasioDos(
      "/transactions",
      cobroDelGimnasioDos({ memberId: usuarioTemploId }),
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, usuarioTemploId) +
        ` (el id ajeno viajo como \`memberId\` del body: el SELECT de \`users\` de create() lleva ` +
        `su tenantWhere y el socio ajeno tiene que NO EXISTIR). Respuesta: ${res.body}`,
    ).toBe(404);

    expect(
      [
        await contarTransacciones(TENANT_DOS),
        await contarTransacciones(TENANT_TEMPLO),
      ],
      `${RUTA} escribio una transaccion aunque contesto que el socio no existe. El 404 llego ` +
        `DESPUES del INSERT — y una fila de plata a nombre de un socio ajeno es corrupcion ` +
        `contable en los dos gimnasios a la vez.`,
    ).toEqual([antesDos, antesTemplo]);
  });

  it("aislamiento: no puede imputarle un cobro a una sede de El Templo", async () => {
    // OJO con el guard que NO alcanza: el preHandler `requireBranchAccess` solo
    // responde "¿este actor puede operar en esta sede?" mirando el PAIS, y las
    // dos sedes son AR — asi que lo pasa. El que tiene que frenar el intento es
    // el guard de sede del handler, que si lleva `tenantWhere(branches, ctx)`.
    // Por eso este caso vale: ejercita la unica barrera que queda.
    const antesDos = await contarTransacciones(TENANT_DOS);
    const antesTemplo = await contarTransacciones(TENANT_TEMPLO);

    const res = await postComoGimnasioDos(
      "/transactions",
      cobroDelGimnasioDos({ branchId: templo.branchId }),
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.branchId) +
        ` (el id ajeno viajo como \`branchId\` del body: para el gimnasio ${TENANT_DOS} esa sede ` +
        `tiene que NO EXISTIR). Respuesta: ${res.body}`,
    ).toBe(404);

    expect(
      [
        await contarTransacciones(TENANT_DOS),
        await contarTransacciones(TENANT_TEMPLO),
      ],
      `${RUTA} escribio una transaccion imputada a una sede ajena aunque contesto que no existe: ` +
        `el 404 llego DESPUES del INSERT.`,
    ).toEqual([antesDos, antesTemplo]);
  });

  it("control: el cobro propio queda estampado en las TRES tablas del gimnasio 2", async () => {
    // Un cobro no escribe una fila: escribe tres (el asiento, su imputacion y el
    // saldo del socio). Basta con que UNA de las tres pierda el gimnasio para
    // que la plata quede contablemente en el gimnasio equivocado sin que ninguna
    // pantalla lo muestre.
    const res = await postComoGimnasioDos(
      "/transactions",
      cobroDelGimnasioDos({
        kind: "plan_charge",
        links: [
          {
            targetKind: "debt_balance",
            targetId: dos.balanceId,
            allocatedAmount: MONTO_COBRO_NUEVO,
          },
        ],
      }),
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(201);
    const cuerpo = JSON.parse(res.body) as {
      transaction: { id: number };
      links: Array<{ id: number }>;
      affectedBalances: Array<{ id: number }>;
    };

    expect(
      cuerpo.links.length > 0 && cuerpo.affectedBalances.length > 0,
      `${RUTA} contesto 201 pero no devolvio la imputacion o el saldo afectado. Sin esas dos ` +
        `filas este control no puede mirar las tres tablas, que es todo su punto.`,
    ).toBe(true);

    expect(
      [
        await tenantDeLaFila(
          app,
          "financial_transactions",
          cuerpo.transaction.id,
        ),
        await tenantDeLaFila(app, "transaction_links", cuerpo.links[0].id),
        await tenantDeLaFila(app, "balances", cuerpo.affectedBalances[0].id),
      ],
      `El cobro del gimnasio ${TENANT_DOS} nacio con alguna de sus tres filas en otro gimnasio ` +
        `(orden: financial_transactions, transaction_links, balances). Si alguna dice ` +
        `${TENANT_TEMPLO}, ese INSERT perdio su \`tenantValues(ctx, …)\` y cayo en el DEFAULT 1 ` +
        `de la columna: la plata quedaria en el gimnasio equivocado sin que ninguna pantalla lo ` +
        `muestre. Mirar create() y applyDelta() en src/modules/finance/.`,
    ).toEqual([TENANT_DOS, TENANT_DOS, TENANT_DOS]);

    // La caja NO viaja en el body (el schema la descarta): la resuelve el
    // servidor desde el medio de pago y la sede. Que haya elegido la caja PROPIA
    // es la prueba de que ese resolver tambien esta scopeado.
    expect(
      (await fotoDeLaTransaccion(cuerpo.transaction.id)).cashRegisterId,
      `El cobro propio quedo imputado a una caja que no es la del gimnasio ${TENANT_DOS}. Si es ` +
        `${templo.cajaId}, \`resolveCashRegister\` esta resolviendo la caja de efectivo de El ` +
        `Templo y el arqueo ajeno se ensucia con plata que no es suya.`,
    ).toBe(dos.cajaId);
  });
});

describe("validacion de un cobro — POST /api/admin/finance/transactions/:id/validate", () => {
  const RUTA = "POST /api/admin/finance/transactions/:id/validate";

  it("aislamiento: no puede validar el pendiente de El Templo, y queda igual", async () => {
    // El objetivo esta PENDIENTE a proposito: si estuviera validado, un intento
    // que se colara chocaria con el guard de estado y devolveria un error igual,
    // escondiendo la fuga detras de la validacion de negocio.
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteTemplo}/validate`,
      {},
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, pendienteTemplo) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarTransaccionAjenaIntacta(RUTA, pendienteTemplo, {
      validationStatus: "pendiente",
      anulada: false,
      cashRegisterId: templo.cajaId,
      amount: MONTO_PENDIENTE_TEMPLO,
    });
  });

  it("aislamiento: no puede imputar su propio cobro a una caja de El Templo", async () => {
    // Es el UNICO vector de "caja ajena" que la superficie HTTP deja alcanzar:
    // `POST /transactions` no acepta `cashRegisterId` en el body (lo resuelve el
    // servidor), pero validate SI deja elegirla. Validar contra una caja ajena
    // es el camino mas directo a corromper el arqueo del vecino.
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteDos}/validate`,
      { cashRegisterId: templo.cajaId },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.cajaId) +
        ` (aca la fila ajena es la CAJA: para el gimnasio ${TENANT_DOS} tiene que no existir, y ` +
        `el guard de coherencia de validate() la rechaza por eso). Respuesta: ${res.body}`,
    ).toBe(400);
    expect(
      await fotoDeLaTransaccion(pendienteDos),
      `${RUTA} rechazo la caja ajena pero igual toco el cobro propio: tiene que quedar PENDIENTE ` +
        `y con su caja de siempre. Un rechazo que ya escribio la mitad es peor que no rechazar.`,
    ).toEqual({
      tenantId: TENANT_DOS,
      validationStatus: "pendiente",
      anulada: false,
      cashRegisterId: dos.cajaId,
      amount: MONTO_PENDIENTE_DOS,
    });
  });

  it("control: SI puede validar su propio pendiente, eligiendo su propia caja", async () => {
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteDos}/validate`,
      { cashRegisterId: dos.cajaId },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, pendienteDos) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await fotoDeLaTransaccion(pendienteDos),
      `${RUTA} contesto 200 pero el cobro propio no quedo validado. Sin este control, el caso de ` +
        `aislamiento de al lado pasaria en verde con la ruta rota para TODOS.`,
    ).toEqual({
      tenantId: TENANT_DOS,
      validationStatus: "validado",
      anulada: false,
      cashRegisterId: dos.cajaId,
      amount: MONTO_PENDIENTE_DOS,
    });
  });
});

describe("observacion de un cobro — POST /api/admin/finance/transactions/:id/observe", () => {
  const RUTA = "POST /api/admin/finance/transactions/:id/observe";

  it("aislamiento: no puede observar el pendiente de El Templo, y queda igual", async () => {
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteTemplo}/observe`,
      { reason: "Observado desde el gimnasio equivocado" },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, pendienteTemplo) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarTransaccionAjenaIntacta(RUTA, pendienteTemplo, {
      validationStatus: "pendiente",
      anulada: false,
      cashRegisterId: templo.cajaId,
      amount: MONTO_PENDIENTE_TEMPLO,
    });
  });

  it("control: SI puede observar su propio pendiente", async () => {
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteDos}/observe`,
      { reason: "Falta el comprobante" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, pendienteDos) + ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      (await fotoDeLaTransaccion(pendienteDos)).validationStatus,
      `${RUTA} contesto 200 pero el cobro propio no quedo observado.`,
    ).toBe("observado");
  });
});

describe("correccion de un cobro — POST /api/admin/finance/transactions/:id/correct", () => {
  const RUTA = "POST /api/admin/finance/transactions/:id/correct";

  it("aislamiento: no puede corregir el pendiente de El Templo, y no lo anula", async () => {
    // Corregir es anular + recrear: si el intento prosperara, la fila ajena
    // quedaria ANULADA aunque la respuesta hablara de otra cosa. Por eso la
    // evidencia mira `voided_at` y el importe, no solo el estado.
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteTemplo}/correct`,
      { correctedFields: { amount: 1 } },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, pendienteTemplo) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarTransaccionAjenaIntacta(RUTA, pendienteTemplo, {
      validationStatus: "pendiente",
      anulada: false,
      cashRegisterId: templo.cajaId,
      amount: MONTO_PENDIENTE_TEMPLO,
    });
  });

  it("aislamiento: no puede reasignarle su propio cobro a un socio de El Templo", async () => {
    // `correctedFields.memberId` es un id de socio elegido por el cliente: el
    // camino mas corto para mudar plata de un gimnasio al otro sin tocar ninguna
    // ruta de alta. Y como todo el metodo corre en UNA transaccion, el rechazo
    // tiene que dejar el cobro propio SIN anular: es tambien la prueba de que el
    // rollback funciona.
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteDos}/correct`,
      { correctedFields: { memberId: usuarioTemploId } },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, usuarioTemploId) +
        ` (el id ajeno viajo como \`correctedFields.memberId\`). Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await fotoDeLaTransaccion(pendienteDos),
      `${RUTA} rechazo al socio ajeno pero dejo el cobro propio anulado a medias: corregir es ` +
        `anular + recrear dentro de UNA transaccion, asi que el rechazo tiene que revertir la ` +
        `anulacion. Un cobro anulado sin reemplazo es plata que desaparece del arqueo.`,
    ).toEqual({
      tenantId: TENANT_DOS,
      validationStatus: "pendiente",
      anulada: false,
      cashRegisterId: dos.cajaId,
      amount: MONTO_PENDIENTE_DOS,
    });
  });

  it("control: SI puede corregir su propio cobro, y el reemplazo nace en el gimnasio 2", async () => {
    const res = await postComoGimnasioDos(
      `/transactions/${pendienteDos}/correct`,
      { correctedFields: { amount: MONTO_CORREGIDO } },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, pendienteDos) + ` Respuesta: ${res.body}`,
    ).toBe(201);
    const nueva = (JSON.parse(res.body) as { transaction: { id: number } })
      .transaction;

    expect(
      await fotoDeLaTransaccion(pendienteDos),
      `${RUTA} contesto 201 pero el cobro original no quedo anulado como corregido.`,
    ).toEqual({
      tenantId: TENANT_DOS,
      validationStatus: "corregido",
      anulada: true,
      cashRegisterId: dos.cajaId,
      amount: MONTO_PENDIENTE_DOS,
    });
    expect(
      await fotoDeLaTransaccion(nueva.id),
      `El reemplazo que creo la correccion no nacio en el gimnasio ${TENANT_DOS} o no quedo con ` +
        `el importe corregido: \`correct()\` recrea llamando a \`create()\` con el mismo \`ctx\`, ` +
        `asi que un gimnasio distinto aca significa que el ctx se perdio en el camino.`,
    ).toEqual({
      tenantId: TENANT_DOS,
      validationStatus: "validado",
      anulada: false,
      cashRegisterId: dos.cajaId,
      amount: MONTO_CORREGIDO,
    });
  });
});

describe("anulacion de un cobro — POST /api/admin/finance/transactions/:id/void", () => {
  const RUTA = "POST /api/admin/finance/transactions/:id/void";

  it("aislamiento: no puede anular la transaccion de El Templo, y sigue viva", async () => {
    const res = await postComoGimnasioDos(
      `/transactions/${templo.transactionId}/void`,
      { reason: "Anulada desde el gimnasio equivocado" },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.transactionId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarTransaccionAjenaIntacta(RUTA, templo.transactionId, {
      validationStatus: "validado",
      anulada: false,
      cashRegisterId: templo.cajaId,
      amount: IMPORTE_SEMBRADO,
    });
  });

  it("control: SI puede anular su propia transaccion", async () => {
    const res = await postComoGimnasioDos(
      `/transactions/${dos.transactionId}/void`,
      { reason: "Cobro duplicado" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.transactionId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    const foto = await fotoDeLaTransaccion(dos.transactionId);
    expect(
      foto.anulada,
      `${RUTA} contesto 200 pero la transaccion propia sigue sin anular: la anulacion no corrio y ` +
        `el caso de aislamiento de al lado estaria pasando con la ruta rota para TODOS.`,
    ).toBe(true);
    expect(
      foto.tenantId,
      `La transaccion propia cambio de gimnasio al anularla: el UPDATE esta tocando \`tenant_id\`.`,
    ).toBe(TENANT_DOS);
  });
});
