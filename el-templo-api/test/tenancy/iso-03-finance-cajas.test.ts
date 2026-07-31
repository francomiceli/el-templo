/**
 * Fase 172 Plan 17 (ISO-03) — AISLAMIENTO de cajas y centros de costo, ruta por
 * ruta, contra un segundo gimnasio real.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * ISO-03 es el requisito que el milestone usa como GATE para onboardear el
 * segundo gimnasio: hasta que esta bateria este verde, `finance` no esta
 * adoptado. Los planes 172-02…172-16 migraron el codigo y endurecieron la suite,
 * pero eso prueba que "con el sentinel encendido no se rompio nada" — NO prueba
 * aislamiento. Esto si.
 *
 * Es ademas la PLANTILLA que copian las fases 173-175, asi que su forma importa
 * tanto como su cobertura.
 *
 * QUE RUTAS CUBRE (14 de las 38 finance del manifiesto)
 * ----------------------------------------------------
 * El grupo "cajas y centros de costo" de `test/tenant-manifest.ts`:
 *
 *   GET    /api/admin/finance/cash-registers
 *   GET    /api/admin/finance/cash-registers/balances
 *   GET    /api/admin/finance/cash-registers/balances/export
 *   GET    /api/admin/finance/cost-centers
 *   GET    /api/admin/finance/cost-centers/all
 *   POST   /api/admin/finance/cash-registers
 *   POST   /api/admin/finance/cash-registers/efectivo
 *   PATCH  /api/admin/finance/cash-registers/:id
 *   POST   /api/admin/finance/cash-registers/:id/close
 *   POST   /api/admin/finance/cash-registers/:id/reactivate
 *   POST   /api/admin/finance/cost-centers
 *   PATCH  /api/admin/finance/cost-centers/:id
 *   POST   /api/admin/finance/cost-centers/:id/deactivate
 *   POST   /api/admin/finance/cost-centers/:id/reactivate
 *
 * Las otras 24 estan en `iso-03-finance-transacciones.test.ts` (13, plan 172-18)
 * y `iso-03-finance-coach-load.test.ts` (11, plan 172-19).
 *
 * EL CONTRATO QUE SE AFIRMA (D-09, para TODO el milestone)
 * -------------------------------------------------------
 * El recurso de otro gimnasio es INDISTINGUIBLE de uno inexistente:
 *   - GET by-id de un recurso ajeno            → 404
 *   - listados                                 → sin una sola fila ajena
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
 * leccion exacta que el plan 172-16 pago en `test/setup.ts`. No lo "aclares"
 * escribiendo el numero.
 *
 * CADA CASO DE AISLAMIENTO LLEVA SU CONTROL POSITIVO (D-08)
 * --------------------------------------------------------
 * Un 404 puede venir del aislamiento o de una siembra rota, y los dos se ven
 * igual desde afuera. Por eso cada `describe` tiene DOS `it`: el de aislamiento
 * y el de control, que hace la MISMA operacion sobre el recurso PROPIO del
 * gimnasio 2 y exige que funcione. Sin el control, este archivo pasaria en verde
 * con la base vacia.
 *
 * LA EVIDENCIA SE LEE DE LA BASE, NO DE LA RESPUESTA HTTP
 * ------------------------------------------------------
 * Un handler que MUTE la fila ajena y despues conteste 404 daria verde mirando
 * solo el status. Por eso las escrituras releen la fila objetivo con
 * `tenantDeLaFila` / `campoDeLaFila` (`test/fixtures/finance-gimnasio-dos.ts`) y
 * comparan contra su valor original.
 *
 * EL ACTOR (D-10)
 * ---------------
 * `gym2.adminToken` (rol `admin`) en las 14. No es comodidad: 12 de las 14 son
 * `ADMIN_ROLES`-only (admin/owner) y `GET /cost-centers` es `FINANCE_VOID_ROLES`,
 * asi que `admin` ES el rol minimo real de casi todas. Las dos que aceptan menos
 * (`/cash-registers/balances` y su export, gateadas por `FINANCE_READ_ROLES`)
 * tampoco pueden bajar mas con este fixture: el unico otro staff que
 * `seedSecondTenant` crea es un `coach`, y coach esta EXCLUIDO de
 * `FINANCE_READ_ROLES`. El borde menos privilegiado de finance lo ejerce el plan
 * 172-19 con `gym2.coachToken` sobre `/coach-load/*`.
 *
 * COMO CORRERLO
 * -------------
 * Solo este archivo: mas de uno a la vez revienta el timeout del provisioning de
 * la DB por worker en esta maquina (~100 s por archivo).
 *   pnpm exec vitest run test/tenancy/iso-03-finance-cajas.test.ts --hookTimeout=250000
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md (lo escribe el plan 172-23)
 * @see .planning/phases/172-adopci-n-1-piloto-finance/172-CONTEXT.md — D-08/D-09/D-10
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
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

/** Rango que contiene a la fecha de las transacciones sembradas. */
const RANGO = { dateFrom: "2026-01-01", dateTo: "2026-01-31" };

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FinanzasDeElTemplo;
let dos: FinanzasDelGimnasioDos;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // EL ORDEN ES OBLIGADO, no cosmetico:
  //  1. `cleanAllTestData` vacia ~90 tablas SIN filtro de gimnasio y borra todos
  //     los users menos `admin@test.com`. Sembrar antes de limpiar deja el
  //     gimnasio 2 a medias.
  //  2. `limpiarFinanzasDeLaBateria` va ANTES de `seedSecondTenant`: aquel
  //     arranca borrando la fila de `tenants` del gimnasio 2, y un centro de
  //     costo suyo sobreviviente del test anterior se lo impide por
  //     `fk_cost_centers_tenant` (`cost_centers` no esta en `TABLES_TO_CLEAN`).
  //  3. y 4./5.: el esqueleto primero, las finanzas despues.
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarFinanzasTemplo(app);
  dos = await sembrarFinanzasGimnasioDos(app, gym2);
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

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** GET como staff del gimnasio 2. */
async function getComoGimnasioDos(url: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
  });
}

/** POST / PATCH como staff del gimnasio 2. */
async function escribirComoGimnasioDos(
  method: "POST" | "PATCH",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${gym2.adminToken}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/**
 * Mensaje compartido de los rojos de AISLAMIENTO en listados.
 *
 * Nombra el gimnasio de la fila filtrada, porque un `expected 90671 to be …`
 * pelado no le dice a nadie que se acaba de abrir un agujero entre gimnasios.
 */
function porQueImportaElListado(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} la fila ${filaId}, que NO es suya. ` +
    `Eso es una fuga de datos entre gimnasios (T-172-17-01): el listado perdio su ` +
    `\`tenantWhere(tabla, ctx)\`, o el \`ctx\` no salio de \`assertTenant(request.scope, …)\`. ` +
    `Empezar por el metodo que sirve esa ruta en src/modules/finance/cash-register-service.ts ` +
    `y por su handler en src/modules/finance/routes.ts. NO "arreglar" esto filtrando en el front.`
  );
}

/** Mensaje compartido de los rojos de CONTROL POSITIVO. */
function porQueImportaElControl(ruta: string, filaId: number): string {
  return (
    `${ruta} NO le devolvio al staff del gimnasio ${TENANT_DOS} su PROPIA fila ${filaId}. ` +
    `Esto no es un problema de aislamiento sino de siembra o de scope de mas: sin este control, ` +
    `el test de aislamiento de al lado pasaria en verde por la razon equivocada (una base vacia ` +
    `tambien "no filtra nada"). Revisar test/fixtures/finance-gimnasio-dos.ts y el filtro de ` +
    `pais/sede de la ruta antes de tocar la capa de tenancy.`
  );
}

/**
 * Afirma que TODAS las filas que la ruta devolvio son del gimnasio 2, leyendo el
 * `tenant_id` de cada una DE LA BASE.
 *
 * Es mas fuerte que "no aparece el id que sembre en El Templo": caza tambien las
 * filas ajenas que este archivo no sembro (las cajas "Banco ARS"/"Banco EUR" y
 * los centros de costo de las migraciones 0161/0163/0165, que existen en la base
 * de test y son de El Templo).
 */
async function afirmarQueTodasSonDelGimnasioDos(
  ruta: string,
  tabla: "cash_registers" | "cost_centers",
  ids: number[],
): Promise<void> {
  for (const id of ids) {
    expect(
      await tenantDeLaFila(app, tabla, id),
      porQueImportaElListado(ruta, id),
    ).toBe(TENANT_DOS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // `listActiveCajasWithBalance` y los dos `cost-centers` filtran por pais
    // ademas de por gimnasio. Si la sede del gimnasio 2 fuera ES y la de El
    // Templo AR, TODOS los casos de aislamiento de abajo pasarian en verde sin
    // que la capa de tenancy hiciera absolutamente nada.
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
      `Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO aisla; ` +
        `con paises distintos el filtro de country escondaria las filas ajenas igual y los ` +
        `casos de abajo pasarian sin ejercer la capa de tenancy. Arreglo: que las dos sedes ` +
        `vuelvan a ser AR (test/fixtures/second-tenant.ts y test/setup.ts), NO relajar estas ` +
        `aserciones.`,
    ).toEqual(["AR", "AR"]);
  });

  it("El Templo tiene finanzas propias que el gimnasio 2 NO tiene que ver", async () => {
    // Precondicion, no decoracion: si la siembra de El Templo fallara, "el
    // gimnasio 2 no ve nada ajeno" seria trivialmente cierto.
    expect(
      [
        await tenantDeLaFila(app, "cash_registers", templo.cajaId),
        await tenantDeLaFila(app, "cash_registers", templo.bankAccountId),
        await tenantDeLaFila(app, "cost_centers", templo.costCenterId),
        await tenantDeLaFila(
          app,
          "financial_transactions",
          templo.transactionId,
        ),
      ],
      `Alguna de las filas ajenas no quedo en El Templo (${TENANT_TEMPLO}). Sin recurso ajeno ` +
        `vivo, todos los casos de aislamiento de este archivo pasan probando nada. Revisar ` +
        `sembrarFinanzasTemplo en test/fixtures/finance-gimnasio-dos.ts.`,
    ).toEqual([TENANT_TEMPLO, TENANT_TEMPLO, TENANT_TEMPLO, TENANT_TEMPLO]);
  });

  it("el gimnasio 2 tiene finanzas propias, sembradas en el gimnasio 2", async () => {
    expect(
      [
        await tenantDeLaFila(app, "cash_registers", dos.cajaId),
        await tenantDeLaFila(app, "cash_registers", dos.bankAccountId),
        await tenantDeLaFila(app, "cost_centers", dos.costCenterId),
        await tenantDeLaFila(app, "financial_transactions", dos.transactionId),
        await tenantDeLaFila(app, "transaction_links", dos.linkId),
        await tenantDeLaFila(app, "balances", dos.balanceId),
      ],
      `Alguna fila del gimnasio 2 nacio en otro gimnasio. Si el valor es ${TENANT_TEMPLO}, ese ` +
        `INSERT perdio su \`tenantValues(CTX_DOS, …)\` y cayo en el DEFAULT 1 de la columna ` +
        `(T-168-15): el "segundo gimnasio" seria en realidad El Templo y TODOS los controles ` +
        `positivos de abajo estarian mirando datos de El Templo.`,
    ).toEqual([
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
      TENANT_DOS,
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LECTURAS (5 rutas GET del grupo + la variante con rango del listado de saldos)
// ═══════════════════════════════════════════════════════════════════════════

describe("cuentas banco del ABM — GET /api/admin/finance/cash-registers", () => {
  const RUTA = "GET /api/admin/finance/cash-registers";

  it("aislamiento: no devuelve ni una cuenta banco de El Templo", async () => {
    const res = await getComoGimnasioDos("/cash-registers");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const accounts = JSON.parse(res.body).accounts as Array<{ id: number }>;

    // El id sembrado, nombrado explicitamente para que el rojo sea legible…
    expect(
      accounts.map((a) => a.id),
      porQueImportaElListado(RUTA, templo.bankAccountId),
    ).not.toContain(templo.bankAccountId);
    // …y el barrido completo, que ademas caza las cajas "Banco ARS"/"Banco EUR"
    // que siembra test/setup.ts y que este archivo no creo.
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "cash_registers",
      accounts.map((a) => a.id),
    );
  });

  it("control: SI devuelve la cuenta banco propia del gimnasio 2", async () => {
    const res = await getComoGimnasioDos("/cash-registers");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const accounts = JSON.parse(res.body).accounts as Array<{
      id: number;
      name: string;
    }>;
    expect(
      accounts.map((a) => a.id),
      porQueImportaElControl(RUTA, dos.bankAccountId),
    ).toContain(dos.bankAccountId);
    expect(
      accounts.find((a) => a.id === dos.bankAccountId)?.name,
      `${RUTA} devolvio la cuenta propia con otro nombre que el sembrado`,
    ).toBe(dos.bankAccountName);
  });
});

describe("saldos por caja — GET /api/admin/finance/cash-registers/balances", () => {
  const RUTA = "GET /api/admin/finance/cash-registers/balances";

  it("aislamiento: no devuelve ni una caja de El Templo", async () => {
    const res = await getComoGimnasioDos("/cash-registers/balances");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const filas = JSON.parse(res.body) as Array<{ cashRegisterId: number }>;

    expect(
      filas.map((f) => f.cashRegisterId),
      porQueImportaElListado(RUTA, templo.cajaId),
    ).not.toContain(templo.cajaId);
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "cash_registers",
      filas.map((f) => f.cashRegisterId),
    );
  });

  it("control: SI devuelve la caja propia, y su saldo firme es SOLO la plata propia", async () => {
    const res = await getComoGimnasioDos("/cash-registers/balances");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const filas = JSON.parse(res.body) as Array<{
      cashRegisterId: number;
      firmeBalance: number;
    }>;
    const propia = filas.find((f) => f.cashRegisterId === dos.cajaId);
    expect(propia, porQueImportaElControl(RUTA, dos.cajaId)).toBeDefined();
    // Los dos gimnasios tienen UNA transaccion validada por el mismo importe.
    // El doble aca seria la plata de El Templo sumada a la del gimnasio 2 — una
    // fuga que un "es mayor que cero" no veria.
    expect(
      propia?.firmeBalance,
      `El saldo firme de la caja propia del gimnasio ${TENANT_DOS} no es ${IMPORTE_SEMBRADO}. ` +
        `Si es ${IMPORTE_SEMBRADO * 2}, el SUM de getBalance esta sumando la transaccion de El ` +
        `Templo: le falta el \`tenantWhere(financialTransactions, ctx)\` ` +
        `(src/modules/finance/cash-register-service.ts, getBalance). Si es 0, la siembra del ` +
        `asiento del gimnasio 2 se rompio.`,
    ).toBe(IMPORTE_SEMBRADO);
  });
});

describe("saldos por caja CON rango de fechas (dateFrom/dateTo) — GET /api/admin/finance/cash-registers/balances", () => {
  const RUTA = "GET /api/admin/finance/cash-registers/balances (con rango)";

  it("aislamiento: el movimiento del periodo no cuenta plata de El Templo", async () => {
    // El rango dispara `getPeriodMovement`, que es OTRA agregacion sobre
    // `financial_transactions` distinta de la de `getBalance`: un listado bien
    // filtrado con un periodo mal filtrado seguiria delatando cuanto factura el
    // otro gimnasio.
    const res = await getComoGimnasioDos(
      `/cash-registers/balances?dateFrom=${RANGO.dateFrom}&dateTo=${RANGO.dateTo}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const filas = JSON.parse(res.body) as Array<{
      cashRegisterId: number;
      period: { inflow: number; outflow: number; net: number } | null;
    }>;

    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "cash_registers",
      filas.map((f) => f.cashRegisterId),
    );
    const totalInflow = filas.reduce((a, f) => a + (f.period?.inflow ?? 0), 0);
    expect(
      totalInflow,
      `El ingreso del periodo sumado sobre TODAS las cajas visibles del gimnasio ${TENANT_DOS} ` +
        `no es ${IMPORTE_SEMBRADO}. Si es ${IMPORTE_SEMBRADO * 2}, \`getPeriodMovement\` esta ` +
        `contando la transaccion de El Templo: le falta el filtro de gimnasio en el SUM ` +
        `(src/modules/finance/cash-register-service.ts, getPeriodMovement).`,
    ).toBe(IMPORTE_SEMBRADO);
  });

  it("control: la caja propia trae su periodo calculado, no null", async () => {
    const res = await getComoGimnasioDos(
      `/cash-registers/balances?dateFrom=${RANGO.dateFrom}&dateTo=${RANGO.dateTo}`,
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const filas = JSON.parse(res.body) as Array<{
      cashRegisterId: number;
      period: { inflow: number; net: number } | null;
    }>;
    const propia = filas.find((f) => f.cashRegisterId === dos.cajaId);
    expect(propia, porQueImportaElControl(RUTA, dos.cajaId)).toBeDefined();
    expect(
      propia?.period?.inflow,
      `La caja propia del gimnasio ${TENANT_DOS} volvio sin el ingreso del periodo. Sin este ` +
        `control, el caso de aislamiento de al lado (que exige ${IMPORTE_SEMBRADO}) podria estar ` +
        `dando 0 = 0 con la agregacion rota para todos.`,
    ).toBe(IMPORTE_SEMBRADO);
  });
});

describe("export de saldos — GET /api/admin/finance/cash-registers/balances/export", () => {
  const RUTA = "GET /api/admin/finance/cash-registers/balances/export";

  /** Nombres de la columna "Caja" del .xlsx que devuelve la ruta. */
  async function cajasDelExport(): Promise<string[]> {
    const res = await getComoGimnasioDos("/cash-registers/balances/export");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const wb = new Workbook();
    // El export es un binario: se PARSEA. Mirar solo el status code dejaria la
    // ruta que mas datos entrega de una sola vez sin una sola asercion de
    // contenido.
    // `res.rawPayload` es un Buffer de Node; el tipo Buffer que exceljs empaqueta
    // no es el mismo nominal (precedente: test/reports/outstanding-balances.test.ts).
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const hoja = wb.getWorksheet("Saldos");
    expect(hoja, `${RUTA} no trajo la hoja "Saldos"`).toBeDefined();
    const nombres: string[] = [];
    hoja?.eachRow((row, i) => {
      if (i === 1) return; // encabezado
      nombres.push(String(row.getCell(1).value ?? ""));
    });
    return nombres;
  }

  it("aislamiento: el .xlsx no nombra ninguna caja de El Templo", async () => {
    const nombreAjeno = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      templo.cajaId,
    );
    const nombres = await cajasDelExport();
    expect(
      nombres,
      porQueImportaElListado(RUTA, templo.cajaId) +
        ` (la caja ajena se llama "${nombreAjeno}")`,
    ).not.toContain(nombreAjeno);
  });

  it("control: el .xlsx SI nombra la caja propia del gimnasio 2", async () => {
    const nombrePropio = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      dos.cajaId,
    );
    const nombres = await cajasDelExport();
    expect(nombres, porQueImportaElControl(RUTA, dos.cajaId)).toContain(
      nombrePropio,
    );
  });
});

describe("centros de costo activos (selector de egresos) — GET /api/admin/finance/cost-centers", () => {
  const RUTA = "GET /api/admin/finance/cost-centers";

  it("aislamiento: no devuelve ni un centro de costo de El Templo", async () => {
    const res = await getComoGimnasioDos("/cost-centers");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const centros = JSON.parse(res.body) as Array<{ id: number }>;

    expect(
      centros.map((c) => c.id),
      porQueImportaElListado(RUTA, templo.costCenterId),
    ).not.toContain(templo.costCenterId);
    // El barrido importa especialmente aca: las migraciones 0161/0163/0165
    // sembraron centros de costo de El Templo ("Varios", "Alquiler…") que este
    // archivo no creo y que un listado sin scope devolveria igual.
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "cost_centers",
      centros.map((c) => c.id),
    );
  });

  it("control: SI devuelve el centro de costo propio del gimnasio 2", async () => {
    const res = await getComoGimnasioDos("/cost-centers");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const centros = JSON.parse(res.body) as Array<{ id: number; name: string }>;
    expect(
      centros.map((c) => c.id),
      porQueImportaElControl(RUTA, dos.costCenterId),
    ).toContain(dos.costCenterId);
    expect(
      centros.find((c) => c.id === dos.costCenterId)?.name,
      `${RUTA} devolvio el centro propio con otro nombre que el sembrado`,
    ).toBe(dos.costCenterName);
  });
});

describe("centros de costo del ABM (incluye inactivos) — GET /api/admin/finance/cost-centers/all", () => {
  const RUTA = "GET /api/admin/finance/cost-centers/all";

  it("aislamiento: no devuelve ni un centro de costo de El Templo, ni activo ni dado de baja", async () => {
    // Se da de baja el centro AJENO por la base antes de listar: `/all` es la
    // unica ruta que devuelve inactivos, asi que una fuga podria esconderse
    // justo ahi y no aparecer en `/cost-centers`.
    await app.db
      .update(schema.costCenters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.costCenters, { tenantId: TENANT_TEMPLO }),
          eq(schema.costCenters.id, templo.costCenterId),
        ),
      );

    const res = await getComoGimnasioDos("/cost-centers/all");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const centros = JSON.parse(res.body).centers as Array<{ id: number }>;

    expect(
      centros.map((c) => c.id),
      porQueImportaElListado(RUTA, templo.costCenterId),
    ).not.toContain(templo.costCenterId);
    await afirmarQueTodasSonDelGimnasioDos(
      RUTA,
      "cost_centers",
      centros.map((c) => c.id),
    );
  });

  it("control: SI devuelve el centro propio del gimnasio 2, incluso dado de baja", async () => {
    await app.db
      .update(schema.costCenters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.costCenters, { tenantId: TENANT_DOS }),
          eq(schema.costCenters.id, dos.costCenterId),
        ),
      );

    const res = await getComoGimnasioDos("/cost-centers/all");
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(200);
    const centros = JSON.parse(res.body).centers as Array<{
      id: number;
      isActive: boolean;
    }>;
    expect(
      centros.map((c) => c.id),
      porQueImportaElControl(RUTA, dos.costCenterId),
    ).toContain(dos.costCenterId);
    expect(
      centros.find((c) => c.id === dos.costCenterId)?.isActive,
      `${RUTA} tiene que incluir los centros DADOS DE BAJA del gimnasio propio (es el listado ` +
        `del ABM). Si vuelve solo activos, el caso de aislamiento de al lado esconde su fuga.`,
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITURAS (las 9 rutas POST/PATCH del grupo)
//
// El status por si solo NO alcanza: un handler que MUTE la fila ajena y despues
// conteste "no existe" daria verde mirando nada mas la respuesta. Por eso cada
// caso de aislamiento releé la fila objetivo con `campoDeLaFila` /
// `tenantDeLaFila` y la compara contra su valor original (T-172-17-02).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mensaje compartido de los rojos de AISLAMIENTO en escrituras.
 */
function porQueImportaLaEscritura(ruta: string, filaId: number): string {
  return (
    `${ruta} dejo que el staff del gimnasio ${TENANT_DOS} operara sobre la fila ${filaId}, que es ` +
    `de El Templo (${TENANT_TEMPLO}). Eso es TAMPERING cross-tenant (T-172-17-02): al UPDATE le ` +
    `falta su \`tenantWhere(tabla, ctx)\`, o el guard de lectura previo (getBankAccountRow / ` +
    `getCostCenterRow en src/modules/finance/cash-register-service.ts) dejo de filtrar por ` +
    `gimnasio. El contrato del milestone (D-09) es que el recurso ajeno sea indistinguible de ` +
    `uno inexistente: "no existe", nunca "prohibido".`
  );
}

/**
 * Afirma que la fila AJENA sigue siendo del otro gimnasio y con el mismo valor
 * en la columna que se intento cambiar.
 *
 * Las DOS mitades importan: el gimnasio (nadie se robo la fila) y el valor
 * (nadie la escribio antes de contestar que no existe).
 */
async function afirmarFilaAjenaIntacta(
  ruta: string,
  tabla: "cash_registers" | "cost_centers",
  filaId: number,
  columna: "name" | "is_active",
  valorOriginal: string | null,
): Promise<void> {
  expect(
    await tenantDeLaFila(app, tabla, filaId),
    porQueImportaLaEscritura(ruta, filaId) +
      ` (la fila cambio de GIMNASIO: se la llevaron al ${TENANT_DOS})`,
  ).toBe(TENANT_TEMPLO);
  expect(
    await campoDeLaFila(app, tabla, columna, filaId),
    porQueImportaLaEscritura(ruta, filaId) +
      ` (la columna \`${columna}\` de la fila ajena CAMBIO, aunque la respuesta HTTP dijera que ` +
      `no existe: el 404 llego DESPUES del UPDATE. Mirar solo el status es exactamente la ` +
      `evidencia que este archivo no acepta).`,
  ).toBe(valorOriginal);
}

/** Cuenta las cajas de un gimnasio para una sede + moneda dadas. */
async function contarCajas(
  tenantId: number,
  branchId: number,
  currency: string,
): Promise<number> {
  const filas = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, { tenantId }),
        eq(schema.cashRegisters.branchId, branchId),
        eq(schema.cashRegisters.currency, currency),
      ),
    );
  return filas.length;
}

/** Body valido de alta de cuenta banco (la regla uno-de-dos pide alias o CBU). */
function altaDeCuentaBanco(spoof: Record<string, unknown>) {
  return {
    bankName: "Banco del Gimnasio Dos",
    accountHolder: "Gimnasio Dos",
    currency: MONEDA_SEMBRADA,
    accountAlias: `alta.g2.${Date.now().toString(36)}`,
    ...spoof,
  };
}

describe("alta de cuenta banco — POST /api/admin/finance/cash-registers", () => {
  const RUTA = "POST /api/admin/finance/cash-registers";

  it("aislamiento: con tenantId de El Templo en el body, la cuenta nace igual en el gimnasio 2", async () => {
    // Mass-assignment (T-172-17-03 / T-169-02 aplicado a finance). Aca hay DOS
    // barreras y las dos tienen que estar: `createBankAccountSchema` declara
    // `additionalProperties: false` y ajv corre con `removeAdditional: true`, asi
    // que el campo desconocido se descarta en el transporte; y aguas abajo
    // `tenantValues(ctx, …)` estampa el gimnasio DESPUES del spread, asi que
    // ningun campo del input puede pisarlo. Lo que se afirma es el RESULTADO:
    // el gimnasio de la fila lo eligio el servidor, no el cliente.
    const res = await escribirComoGimnasioDos(
      "POST",
      "/cash-registers",
      altaDeCuentaBanco({ tenantId: TENANT_TEMPLO }),
    );
    expect(
      res.statusCode,
      `${RUTA} con un tenantId spoofeado en el body no devolvio 201: ${res.body}. Si devolvio ` +
        `400, la barrera se mudo al transporte (el schema paso a RECHAZAR la propiedad ` +
        `desconocida en vez de descartarla): tambien es un contrato valido, pero entonces este ` +
        `caso tiene que afirmar eso y no esto.`,
    ).toBe(201);
    const id = JSON.parse(res.body).account.id as number;
    expect(
      await tenantDeLaFila(app, "cash_registers", id),
      `La cuenta banco ${id} nacio en el gimnasio equivocado. Si es ${TENANT_TEMPLO}, el ` +
        `\`tenant_id\` se esta tomando del BODY: el cliente eligio en que gimnasio escribir ` +
        `(T-172-17-03). La regla del milestone es que el gimnasio sale SIEMPRE del scope ` +
        `server-side (src/db/schema/tenant-column.ts:11-16), jamas de un payload.`,
    ).toBe(TENANT_DOS);
  });

  it("control: sin el campo spoofeado, la cuenta nace en el gimnasio 2 igual", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      "/cash-registers",
      altaDeCuentaBanco({}),
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(201);
    const id = JSON.parse(res.body).account.id as number;
    expect(
      await tenantDeLaFila(app, "cash_registers", id),
      porQueImportaElControl(RUTA, id),
    ).toBe(TENANT_DOS);
  });
});

describe("alta de caja efectivo — POST /api/admin/finance/cash-registers/efectivo", () => {
  const RUTA = "POST /api/admin/finance/cash-registers/efectivo";
  // La moneda va distinta de la sembrada a proposito: el invariante "una caja
  // efectivo ACTIVA por (sucursal, moneda)" haria chocar un alta en la moneda
  // del fixture con un 409 que no tiene nada que ver con el aislamiento.
  const MONEDA_LIBRE = "EUR";

  it("aislamiento: no puede abrirle una caja a una sede de El Templo", async () => {
    const antes = await contarCajas(
      TENANT_TEMPLO,
      templo.branchId,
      MONEDA_LIBRE,
    );
    const res = await escribirComoGimnasioDos(
      "POST",
      "/cash-registers/efectivo",
      {
        branchId: templo.branchId,
        currency: MONEDA_LIBRE,
      },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.branchId) +
        ` (la sede es de El Templo y para el gimnasio ${TENANT_DOS} tiene que NO EXISTIR: el ` +
        `SELECT de \`branches\` de createEfectivoCaja lleva su tenantWhere). Respuesta: ${res.body}`,
    ).toBe(404);
    expect(
      await contarCajas(TENANT_TEMPLO, templo.branchId, MONEDA_LIBRE),
      `${RUTA} le abrio una caja de verdad a la sede ${templo.branchId} de El Templo aunque ` +
        `contesto que no existe. El 404 llego DESPUES del INSERT.`,
    ).toBe(antes);
  });

  it("aislamiento: con tenantId de El Templo en el body, la caja nace igual en el gimnasio 2", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      "/cash-registers/efectivo",
      {
        branchId: gym2.branchId,
        currency: MONEDA_LIBRE,
        tenantId: TENANT_TEMPLO,
      },
    );
    expect(res.statusCode, `${RUTA} spoofeado: ${res.body}`).toBe(201);
    const id = JSON.parse(res.body).caja.cashRegisterId as number;
    expect(
      await tenantDeLaFila(app, "cash_registers", id),
      `La caja ${id} nacio en el gimnasio equivocado: el \`tenant_id\` salio del BODY ` +
        `(T-172-17-03) y no del scope server-side.`,
    ).toBe(TENANT_DOS);
  });

  it("control: SI puede abrirle una caja a su propia sede", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      "/cash-registers/efectivo",
      {
        branchId: gym2.branchId,
        currency: MONEDA_LIBRE,
      },
    );
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(201);
    const id = JSON.parse(res.body).caja.cashRegisterId as number;
    expect(
      await tenantDeLaFila(app, "cash_registers", id),
      porQueImportaElControl(RUTA, id),
    ).toBe(TENANT_DOS);
  });
});

describe("edicion de cuenta banco — PATCH /api/admin/finance/cash-registers/:id", () => {
  const RUTA = "PATCH /api/admin/finance/cash-registers/:id";

  it("aislamiento: no puede editar la cuenta banco de El Templo, y la fila queda intacta", async () => {
    const nombreOriginal = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      templo.bankAccountId,
    );
    const res = await escribirComoGimnasioDos(
      "PATCH",
      `/cash-registers/${templo.bankAccountId}`,
      { bankName: "Banco Intervenido" },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.bankAccountId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    // `updateBankAccount` recalcula `name` a partir de `bankName`, asi que si el
    // UPDATE hubiera corrido el nombre habria cambiado: es el testigo exacto.
    await afirmarFilaAjenaIntacta(
      RUTA,
      "cash_registers",
      templo.bankAccountId,
      "name",
      nombreOriginal,
    );
  });

  it("control: SI puede editar su propia cuenta banco", async () => {
    const nombreOriginal = await campoDeLaFila(
      app,
      "cash_registers",
      "name",
      dos.bankAccountId,
    );
    const res = await escribirComoGimnasioDos(
      "PATCH",
      `/cash-registers/${dos.bankAccountId}`,
      { bankName: "Banco Renombrado" },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.bankAccountId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await campoDeLaFila(app, "cash_registers", "name", dos.bankAccountId),
      `${RUTA} contesto 200 pero no cambio el nombre de la cuenta propia. Sin este control, ` +
        `el caso de aislamiento de al lado pasaria en verde con la ruta rota para TODOS.`,
    ).not.toBe(nombreOriginal);
    expect(
      await tenantDeLaFila(app, "cash_registers", dos.bankAccountId),
      `La cuenta propia cambio de gimnasio al editarla: el UPDATE esta tocando \`tenant_id\`.`,
    ).toBe(TENANT_DOS);
  });
});

describe("cierre de cuenta banco — POST /api/admin/finance/cash-registers/:id/close", () => {
  const RUTA = "POST /api/admin/finance/cash-registers/:id/close";

  it("aislamiento: no puede cerrar la cuenta banco de El Templo, y sigue activa", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      `/cash-registers/${templo.bankAccountId}/close`,
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.bankAccountId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarFilaAjenaIntacta(
      RUTA,
      "cash_registers",
      templo.bankAccountId,
      "is_active",
      "1",
    );
  });

  it("control: SI puede cerrar su propia cuenta banco", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      `/cash-registers/${dos.bankAccountId}/close`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.bankAccountId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await campoDeLaFila(
        app,
        "cash_registers",
        "is_active",
        dos.bankAccountId,
      ),
      `${RUTA} contesto 200 pero la cuenta propia sigue activa: la baja logica no corrio.`,
    ).toBe("0");
  });
});

describe("reactivacion de cuenta banco — POST /api/admin/finance/cash-registers/:id/reactivate", () => {
  const RUTA = "POST /api/admin/finance/cash-registers/:id/reactivate";

  it("aislamiento: no puede reactivar una cuenta banco cerrada de El Templo", async () => {
    // Se cierra la cuenta AJENA por la base para que "reactivar" tenga algo real
    // que hacer: si el objetivo ya estuviera activo, un UPDATE que se colara no
    // dejaria rastro y el caso no probaria nada.
    await app.db
      .update(schema.cashRegisters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.cashRegisters, { tenantId: TENANT_TEMPLO }),
          eq(schema.cashRegisters.id, templo.bankAccountId),
        ),
      );

    const res = await escribirComoGimnasioDos(
      "POST",
      `/cash-registers/${templo.bankAccountId}/reactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.bankAccountId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarFilaAjenaIntacta(
      RUTA,
      "cash_registers",
      templo.bankAccountId,
      "is_active",
      "0",
    );
  });

  it("control: SI puede reactivar su propia cuenta banco cerrada", async () => {
    const cierre = await escribirComoGimnasioDos(
      "POST",
      `/cash-registers/${dos.bankAccountId}/close`,
    );
    expect(cierre.statusCode, `cierre previo fallo: ${cierre.body}`).toBe(200);

    const res = await escribirComoGimnasioDos(
      "POST",
      `/cash-registers/${dos.bankAccountId}/reactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.bankAccountId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await campoDeLaFila(
        app,
        "cash_registers",
        "is_active",
        dos.bankAccountId,
      ),
      `${RUTA} contesto 200 pero la cuenta propia sigue cerrada.`,
    ).toBe("1");
  });
});

describe("alta de centro de costo — POST /api/admin/finance/cost-centers", () => {
  const RUTA = "POST /api/admin/finance/cost-centers";

  it("aislamiento: con tenantId de El Templo en el body, el centro nace igual en el gimnasio 2", async () => {
    const res = await escribirComoGimnasioDos("POST", "/cost-centers", {
      name: `Centro spoofeado ${Date.now().toString(36)}`,
      country: "AR",
      tenantId: TENANT_TEMPLO,
    });
    expect(
      res.statusCode,
      `${RUTA} con tenantId spoofeado no devolvio 201: ${res.body}`,
    ).toBe(201);
    const id = JSON.parse(res.body).center.id as number;
    expect(
      await tenantDeLaFila(app, "cost_centers", id),
      `El centro de costo ${id} nacio en el gimnasio equivocado: el \`tenant_id\` salio del ` +
        `BODY (T-172-17-03). \`createCostCenter\` tiene que estampar el gimnasio con ` +
        `\`tenantValues(ctx, …)\` DESPUES del spread.`,
    ).toBe(TENANT_DOS);
  });

  it("control: sin el campo spoofeado, el centro nace en el gimnasio 2 igual", async () => {
    const res = await escribirComoGimnasioDos("POST", "/cost-centers", {
      name: `Centro limpio ${Date.now().toString(36)}`,
      country: "AR",
    });
    expect(res.statusCode, `${RUTA} fallo: ${res.body}`).toBe(201);
    const id = JSON.parse(res.body).center.id as number;
    expect(
      await tenantDeLaFila(app, "cost_centers", id),
      porQueImportaElControl(RUTA, id),
    ).toBe(TENANT_DOS);
  });
});

describe("renombrado de centro de costo — PATCH /api/admin/finance/cost-centers/:id", () => {
  const RUTA = "PATCH /api/admin/finance/cost-centers/:id";

  it("aislamiento: no puede renombrar el centro de costo de El Templo", async () => {
    const res = await escribirComoGimnasioDos(
      "PATCH",
      `/cost-centers/${templo.costCenterId}`,
      { name: "Centro intervenido" },
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.costCenterId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarFilaAjenaIntacta(
      RUTA,
      "cost_centers",
      templo.costCenterId,
      "name",
      templo.costCenterName,
    );
  });

  it("control: SI puede renombrar su propio centro de costo", async () => {
    const nuevo = `Centro propio renombrado ${Date.now().toString(36)}`;
    const res = await escribirComoGimnasioDos(
      "PATCH",
      `/cost-centers/${dos.costCenterId}`,
      { name: nuevo },
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.costCenterId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await campoDeLaFila(app, "cost_centers", "name", dos.costCenterId),
      `${RUTA} contesto 200 pero no renombro el centro propio.`,
    ).toBe(nuevo);
    expect(
      await tenantDeLaFila(app, "cost_centers", dos.costCenterId),
      `El centro propio cambio de gimnasio al renombrarlo: el UPDATE toca \`tenant_id\`.`,
    ).toBe(TENANT_DOS);
  });
});

describe("baja logica de centro de costo — POST /api/admin/finance/cost-centers/:id/deactivate", () => {
  const RUTA = "POST /api/admin/finance/cost-centers/:id/deactivate";

  it("aislamiento: no puede dar de baja el centro de costo de El Templo, y sigue activo", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      `/cost-centers/${templo.costCenterId}/deactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.costCenterId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarFilaAjenaIntacta(
      RUTA,
      "cost_centers",
      templo.costCenterId,
      "is_active",
      "1",
    );
  });

  it("control: SI puede dar de baja su propio centro de costo", async () => {
    const res = await escribirComoGimnasioDos(
      "POST",
      `/cost-centers/${dos.costCenterId}/deactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.costCenterId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await campoDeLaFila(app, "cost_centers", "is_active", dos.costCenterId),
      `${RUTA} contesto 200 pero el centro propio sigue activo.`,
    ).toBe("0");
  });
});

describe("reactivacion de centro de costo — POST /api/admin/finance/cost-centers/:id/reactivate", () => {
  const RUTA = "POST /api/admin/finance/cost-centers/:id/reactivate";

  it("aislamiento: no puede reactivar un centro de costo dado de baja de El Templo", async () => {
    await app.db
      .update(schema.costCenters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.costCenters, { tenantId: TENANT_TEMPLO }),
          eq(schema.costCenters.id, templo.costCenterId),
        ),
      );

    const res = await escribirComoGimnasioDos(
      "POST",
      `/cost-centers/${templo.costCenterId}/reactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaLaEscritura(RUTA, templo.costCenterId) +
        ` Respuesta: ${res.body}`,
    ).toBe(404);
    await afirmarFilaAjenaIntacta(
      RUTA,
      "cost_centers",
      templo.costCenterId,
      "is_active",
      "0",
    );
  });

  it("control: SI puede reactivar su propio centro de costo dado de baja", async () => {
    const baja = await escribirComoGimnasioDos(
      "POST",
      `/cost-centers/${dos.costCenterId}/deactivate`,
    );
    expect(baja.statusCode, `baja previa fallo: ${baja.body}`).toBe(200);

    const res = await escribirComoGimnasioDos(
      "POST",
      `/cost-centers/${dos.costCenterId}/reactivate`,
    );
    expect(
      res.statusCode,
      porQueImportaElControl(RUTA, dos.costCenterId) +
        ` Respuesta: ${res.body}`,
    ).toBe(200);
    expect(
      await campoDeLaFila(app, "cost_centers", "is_active", dos.costCenterId),
      `${RUTA} contesto 200 pero el centro propio sigue dado de baja.`,
    ).toBe("1");
  });
});
