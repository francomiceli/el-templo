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

describe("saldos por caja CON rango de fechas — GET /api/admin/finance/cash-registers/balances?dateFrom&dateTo", () => {
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
