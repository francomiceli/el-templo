/**
 * Fase 173 Plan 11 (ADO-07): tests con DOS gimnasios de
 * `resolveBranchDelGimnasio` / `assertBranchDelGimnasio`
 * (`src/modules/shared/branch-consistency.ts`) y de `canAccessBranch`
 * (`src/modules/shared/branch-access.ts`, D-14).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * El invariante de anclas (`user.tenant_id === branch.tenant_id`, mina M10)
 * todavía NO tiene consumidores en este plan — los 16 sitios que reescriben
 * `users.branch_id` / `user_branches.branch_id` migran en los planes 173-13,
 * 173-14, 173-15, 173-16 y 173-18. Este archivo prueba la PIEZA antes de que
 * tenga dueños: si el helper mintiera, todos esos planes construirían sobre
 * una base rota sin enterarse.
 *
 * DOS FUNCIONES, DOS CONTRATOS
 * ----------------------------
 *   - `resolveBranchDelGimnasio` devuelve la fila o `null`. `null` cubre TRES
 *     casos indistinguibles a propósito (D-06): `branchId` nulo, sede
 *     inexistente, sede de OTRO gimnasio.
 *   - `assertBranchDelGimnasio` es lo mismo pero LANZA en vez de `null` — el
 *     mismo `NotFoundError("Sede no encontrada")` que el resto del código ya
 *     mapea a "no encontrado". Cero 403 en los dos: un 403 confirmaría que la
 *     sede existe en otro gimnasio, que es la fuga que D-06 prohíbe.
 *
 * `canAccessBranch` (D-14) ENTRA a este archivo aunque vive en otro módulo
 * porque ADO-07 y D-14 son el MISMO invariante mirado desde los dos lados: uno
 * impide que un socio quede apuntando a una sede ajena, el otro impide que un
 * STAFF opere una sede ajena. Los dos bypasses que D-14 cierra (Regla 1
 * `isVirtual`, Regla 3 país) se prueban acá con el mismo par de gimnasios.
 *
 * PRECONDICIÓN OBLIGATORIA: MISMO PAÍS
 * -------------------------------------
 * Las dos sedes en juego son AR (la de El Templo que siembra `test/setup.ts` y
 * la que siembra `seedSecondTenant`). Si no compartieran país, el aislamiento
 * de `canAccessBranch` podría estar dándolo el filtro de país en vez del
 * filtro de gimnasio, y los casos de abajo pasarían en verde sin ejercer D-14
 * — ver el `it` de precondición.
 *
 * SEDE VIRTUAL PROPIA DEL GIMNASIO 2
 * -----------------------------------
 * `seedSecondTenant` NO siembra una sede virtual para el gimnasio 2 (solo una
 * sede física). Este archivo crea la suya (`crearSedeVirtualDelGimnasioDos`)
 * porque el caso "bypass de la Regla 1" necesita una sede `isVirtual: true`
 * que sea del gimnasio 2 — sin eso, ese caso no se puede ejercitar.
 * `limpiarSegundoGimnasio` ya borra TODAS las filas de `branches` con
 * `tenant_id = TENANT_DOS` (ver su docblock), así que esta sede extra no
 * necesita limpieza propia.
 *
 * CERO CODIGOS DE ACCESO DENEGADO
 * ---------------------------------
 * Ninguna aserción de este archivo compara contra el código HTTP de "acceso
 * denegado" — ni siquiera en un comentario que lo escriba tal cual (el piloto
 * lo pagó: un gate por substring no distingue código de comentario). Los
 * rechazos se describen en castellano, nunca con el número.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  resolveBranchDelGimnasio,
  assertBranchDelGimnasio,
} from "../../src/modules/shared/branch-consistency";
import { canAccessBranch } from "../../src/modules/shared/branch-access";
import { NotFoundError } from "../../src/modules/shared/errors";
import type { CountryScope } from "../../src/modules/shared/country-scope";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

// ─── Contextos de escritura ──────────────────────────────────────────────────

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
/** Sede FISICA de El Templo (no virtual), resuelta — nunca hardcodeada. */
let temploBranchId: number;
/** Sede VIRTUAL de El Templo ("Templo Online", sembrada por test/setup.ts). */
let temploVirtualBranchId: number;
/** Sede VIRTUAL propia del gimnasio 2, creada por este archivo. */
let gym2VirtualBranchId: number;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // Orden obligado (ver docblock de test/fixtures/second-tenant.ts): limpiar
  // ANTES de sembrar, si no el gimnasio 2 queda a medias.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  temploBranchId = await resolverSedeDeElTemplo({ virtual: false });
  temploVirtualBranchId = await resolverSedeDeElTemplo({ virtual: true });
  gym2VirtualBranchId = await crearSedeVirtualDelGimnasioDos();
});

afterAll(async () => {
  // Obligatorio: la base la comparten los archivos del worker (isolate: false).
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Resuelve una sede de El Templo por su condición `isVirtual`, en vez de
 * asumir un id: el id depende del orden de las migraciones y del seed, y un
 * literal acá es un rojo que solo aparece en la base de otro (mismo idioma que
 * `sembrarFinanzasTemplo` en `test/fixtures/finance-gimnasio-dos.ts`).
 */
async function resolverSedeDeElTemplo(opts: {
  virtual: boolean;
}): Promise<number> {
  const [sede] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, CTX_TEMPLO),
        eq(schema.branches.isVirtual, opts.virtual),
      ),
    )
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      `resolverSedeDeElTemplo: El Templo no tiene ninguna sede ${opts.virtual ? "virtual" : "no virtual"}. ` +
        "Las siembra test/setup.ts (codigos TEST/ONLINE) - revisar ese archivo.",
    );
  }
  return sede.id;
}

/** Sufijo unico por corrida, mismo generador que test/fixtures/second-tenant.ts. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Crea la sede VIRTUAL propia del gimnasio 2. `seedSecondTenant` no siembra
 * una (solo la sede fisica): sin esta, el caso "bypass de la Regla 1" de
 * `canAccessBranch` no se puede ejercitar con una sede virtual AJENA de
 * verdad. `limpiarSegundoGimnasio` la limpia sola (borra TODO `branches` con
 * `tenant_id = TENANT_DOS`).
 */
async function crearSedeVirtualDelGimnasioDos(): Promise<number> {
  const suf = sufijo();
  const [sede] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(CTX_DOS, {
        name: `Sede virtual del gimnasio 2 ${suf}`,
        code: `G2V${suf}`.toUpperCase().slice(0, 20),
        country: "AR",
        isVirtual: true,
        isActive: true,
      }),
    )
    .$returningId();
  return sede.id;
}

/** Scope de un admin del gimnasio 2, para ejercitar canAccessBranch (D-14). */
function scopeAdminGimnasioDos(): CountryScope {
  return {
    tenantId: TENANT_DOS,
    country: "AR",
    branchIds: [],
    isOwner: false,
    role: "admin",
    userBranchId: gym2.branchId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondición: sin esto, todo lo de abajo puede pasar por la razon equivocada
// ═══════════════════════════════════════════════════════════════════════════

describe("precondicion de la bateria", () => {
  it("las dos sedes en juego son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // Si la sede del gimnasio 2 fuera ES y las de El Templo AR (o viceversa),
    // TODOS los casos de aislamiento de abajo (helper Y canAccessBranch)
    // pasarian en verde sin que la capa de tenancy hiciera absolutamente nada:
    // el filtro de pais ya las distinguiria.
    const [sedeDos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX_DOS),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    const [sedeTemplo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, temploBranchId),
        ),
      );
    expect(
      [sedeDos?.country, sedeTemplo?.country],
      "Las dos sedes dejaron de compartir pais. Este archivo prueba que el GIMNASIO aisla " +
        "(D-14/D-06), no el pais: con paises distintos el filtro de country escondaria las " +
        "sedes ajenas igual y los casos de abajo pasarian sin ejercer la capa de tenancy. " +
        "Arreglo: que las dos sedes vuelvan a ser AR (test/fixtures/second-tenant.ts y " +
        "test/setup.ts), NO relajar estas aserciones.",
    ).toEqual(["AR", "AR"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveBranchDelGimnasio / assertBranchDelGimnasio (D-05a, D-06, D-08)
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveBranchDelGimnasio", () => {
  it("control positivo: con una sede PROPIA devuelve la fila", async () => {
    const branch = await resolveBranchDelGimnasio(
      CTX_TEMPLO,
      temploBranchId,
      app.db,
    );
    expect(
      branch?.id,
      "El helper no devolvio la sede propia de El Templo — sin este control, los casos de " +
        "aislamiento de abajo podrian estar pasando porque el helper nunca devuelve nada, no " +
        "porque filtre correctamente.",
    ).toBe(temploBranchId);
    expect(branch?.tenantId).toBe(TENANT_TEMPLO);
  });

  it("aislamiento: con una sede de OTRO gimnasio devuelve null", async () => {
    const branch = await resolveBranchDelGimnasio(
      CTX_TEMPLO,
      gym2.branchId,
      app.db,
    );
    expect(
      branch,
      `resolveBranchDelGimnasio(CTX_TEMPLO, ${gym2.branchId}) devolvio una fila: la sede del ` +
        `gimnasio ${TENANT_DOS} tendria que ser indistinguible de una sede inexistente para el ` +
        "gimnasio 1 (D-06, mina M10). Revisar que el SELECT siga llevando tenantWhere(branches, ctx).",
    ).toBeNull();
  });

  it("bypass de la Regla 1: con una sede VIRTUAL de otro gimnasio tambien devuelve null", async () => {
    // Este es el caso que branch-access.ts (D-14) necesita que sea null: una
    // sede virtual ajena no puede colarse por ser "global" — tiene que
    // dejar de existir para el gimnasio que pregunta, igual que cualquier
    // otra sede ajena.
    const branch = await resolveBranchDelGimnasio(
      CTX_TEMPLO,
      gym2VirtualBranchId,
      app.db,
    );
    expect(
      branch,
      `La sede virtual propia del gimnasio ${TENANT_DOS} (id ${gym2VirtualBranchId}) se colo ` +
        "para El Templo. Una sede virtual de OTRO gimnasio tiene que ser indistinguible de una " +
        "sede inexistente — si esto falla, el filtro tenantWhere se aplico DESPUES de decidir " +
        "por isVirtual, en vez de antes.",
    ).toBeNull();
  });

  it("branchId null nunca consulta la base y devuelve null de inmediato", async () => {
    // Documentado en el docblock de cabecera del helper: una sede nula no
    // viola el invariante (no hay branch con la que comparar).
    const branch = await resolveBranchDelGimnasio(CTX_TEMPLO, null, app.db);
    expect(branch).toBeNull();
  });
});

describe("assertBranchDelGimnasio", () => {
  it("con sede ajena lanza el mismo NotFoundError('Sede no encontrada') que el resto del codigo", async () => {
    let capturado: unknown;
    try {
      await assertBranchDelGimnasio(CTX_TEMPLO, gym2.branchId, app.db);
    } catch (err: unknown) {
      capturado = err;
    }
    // El motivo se afirma JUNTO con el tipo: una ruta con dos formas de decir
    // "no encontrado" puede pasar por el motivo equivocado.
    expect(
      capturado,
      "assertBranchDelGimnasio no lanzo para una sede de otro gimnasio - tiene que fallar " +
        "IGUAL que una sede inexistente (D-06).",
    ).toBeInstanceOf(NotFoundError);
    expect((capturado as NotFoundError).message).toBe("Sede no encontrada");
    expect(
      (capturado as NotFoundError).statusCode,
      "El contrato de rechazo es 'no encontrada' (404), nunca un codigo de acceso denegado: " +
        "un rechazo distinto confirmaria que la sede existe en otro gimnasio.",
    ).toBe(404);
  });

  it("control positivo: con una sede propia devuelve la fila sin lanzar", async () => {
    const branch = await assertBranchDelGimnasio(
      CTX_TEMPLO,
      temploBranchId,
      app.db,
    );
    expect(branch.id).toBe(temploBranchId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// canAccessBranch (D-14): el gimnasio decide, el pais filtra ADENTRO
// ═══════════════════════════════════════════════════════════════════════════

describe("canAccessBranch — D-14: los dos bypasses cerrados", () => {
  it("un admin del gimnasio 2 NO puede operar una sede FISICA de El Templo (mismo pais)", async () => {
    const allowed = await canAccessBranch(
      scopeAdminGimnasioDos(),
      temploBranchId,
      app.db,
    );
    expect(
      allowed,
      `canAccessBranch dejo operar al gimnasio ${TENANT_DOS} sobre una sede FISICA de El ` +
        `Templo (${temploBranchId}) que comparte pais (AR). Eso es el bypass de la Regla 3 ` +
        "(el pais decidiendo en vez del gimnasio) que D-14 vino a cerrar.",
    ).toBe(false);
  });

  it("un admin del gimnasio 2 NO puede operar la sede VIRTUAL de El Templo ('Templo Online')", async () => {
    // Este es el caso que exige D-14: antes de este plan, isVirtual=true
    // devolvia true ANTES de mirar el gimnasio.
    const allowed = await canAccessBranch(
      scopeAdminGimnasioDos(),
      temploVirtualBranchId,
      app.db,
    );
    expect(
      allowed,
      `canAccessBranch dejo operar al gimnasio ${TENANT_DOS} sobre la sede virtual de El ` +
        "Templo. Ese es el bypass historico de la Regla 1 (isVirtual -> true sin mirar el " +
        "gimnasio) que este plan tiene que haber cerrado.",
    ).toBe(false);
  });

  it("control positivo: un admin del gimnasio 2 SI puede operar su PROPIA sede", async () => {
    const allowed = await canAccessBranch(
      scopeAdminGimnasioDos(),
      gym2.branchId,
      app.db,
    );
    expect(
      allowed,
      "Sin este control, los dos casos de arriba podrian estar pasando porque " +
        "canAccessBranch siempre devuelve false, no porque filtre por gimnasio correctamente.",
    ).toBe(true);
  });
});
