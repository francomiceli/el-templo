/**
 * Fase 175.1 Plan 08 (D1, ISO-03) — batería DEDICADA de tampering de
 * `branchId` ajeno en `assignPlan`/`changePlanNow`/`changePlanAfterCurrent`.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * `iso-03-subs-escritura.test.ts` (174.1-06) documentó el hallazgo pero NO lo
 * probó a propósito (ver su docblock, sección "HALLAZGO DE SEGURIDAD
 * DESCUBIERTO, NO ARREGLADO EN ESTE PLAN"): antes de este plan,
 * `assignPlan`/`changePlanNow` solo validaban `input.branchId` contra el
 * gimnasio DENTRO del sub-flujo condicional de auto-migración virtual→física
 * (que no corre para un socio ya en sede física, el caso común), y
 * `changePlanAfterCurrent` no lo validaba en NINGÚN camino. Un actor podía
 * pasar `userId`/`planId` propios pero un `branchId` de OTRO gimnasio en el
 * body y envenenar la FK `subscriptions.branch_id`. `src/modules/subscriptions/
 * service.ts` (175.1-08) cierra el guard con `assertBranchDelGimnasio` como
 * guard TEMPRANO en los 3 métodos, dentro de la misma tx, antes de cualquier
 * insert. Este archivo es la evidencia de que el cierre funciona.
 *
 * DIRECCION DEL ACTOR (al revés del molde de 174.1-06)
 * ------------------------------------------------------
 * `iso-03-subs-escritura.test.ts` prueba SIEMPRE con el staff del gimnasio 2
 * (`gym2.*Token`) tocando recursos de El Templo. Acá el actor es el staff de
 * El Templo (`admin@test.com`, tenant 1) y el `branchId` ajeno es una sede
 * del gimnasio 2 (`gym2.branchId`, sembrado por `seedSecondTenant`, 171-04) —
 * el `userId`/`planId` del payload son SIEMPRE propios de El Templo. No hace
 * falta el fixture completo de subs+sched del gimnasio 2
 * (`subs-sched-gimnasio-dos.ts`): solo se necesita UNA sede ajena real, que
 * `seedSecondTenant` ya deja lista.
 *
 * EL CONTRATO QUE SE AFIRMA (D-06 del milestone — cero "prohibido")
 * ---------------------------------------------------------------------------
 * El `branchId` ajeno es INDISTINGUIBLE de uno inexistente: 404 "Sede no
 * encontrada" (NUNCA 403) — mismo mensaje que arroja `assertBranchDelGimnasio`
 * (`src/modules/shared/branch-consistency.ts:142`). La evidencia de que NO se
 * persistió nada se lee de la base: conteo de `subscriptions` del socio
 * (cero filas nuevas) y, para `changePlanNow`/`changePlanAfterCurrent`, una
 * "foto" de la suscripción vigente ANTES/DESPUÉS del intento (mismo idioma
 * que `iso-03-subs-escritura.test.ts`) — `changePlanNow` cierra la sub vieja
 * como 'changed' ANTES del guard y la restaura en su bloque `catch` (ver
 * `service.ts` ~L4090) ante cualquier error, así que la foto tiene que volver
 * exactamente a 'active'.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-subs-branch-tampering.test.ts test/subscriptions
 *
 * @see test/tenancy/iso-03-subs-escritura.test.ts — el molde de escritura (174.1-06), el hallazgo original
 * @see test/fixtures/second-tenant.ts — la siembra que este archivo consume (gym2.branchId, el branchId ajeno)
 * @see test/subscriptions/pricing-golden.test.ts — el guardrail de pricing (diff-cero) que este plan no puede mover
 * @see .planning/phases/175.1-.../175.1-08-PLAN.md — D1, T-175.1-08-01/02/03
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "../subscriptions/_helpers";

/** Sufijo único por corrida, mismo generador que el resto de los fixtures. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

let app: FastifyInstance;
let adminToken: string;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Evidencia leida de la BASE ──────────────────────────────────────────────

async function consultar<T>(consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/** Cuenta filas de `subscriptions` para un userId, SIN filtro de gimnasio ("cero filas nuevas"). */
async function contarSuscripcionesDeUsuario(userId: number): Promise<number> {
  const filas = await consultar<{ c: number }>(
    sql`SELECT /* tenant-safe: contar subscriptions de un userId (sin filtro de gimnasio) es la asercion de "cero filas nuevas" — filtrar la volveria tautologica */ COUNT(*) AS c FROM subscriptions WHERE user_id = ${userId}`,
  );
  return Number(filas[0]?.c ?? 0);
}

interface FotoDeSuscripcion {
  status: string | null;
  planId: number | null;
  branchId: number | null;
  endDate: string | null;
}

/** "Foto" de varias columnas juntas — un rechazo que ya escribio la mitad se ve
 * igual que uno limpio si se mira una sola columna (mismo idioma que 174.1-06). */
async function fotoDeSuscripcion(
  subscriptionId: number,
): Promise<FotoDeSuscripcion> {
  const filas = await consultar<{
    status: string | null;
    plan_id: number | null;
    branch_id: number | null;
    end_date: string | null;
  }>(
    // La columna real es `subscription_status` (el 1er arg de `mysqlEnum` en
    // subscriptions.ts) — mismo desacople documentado en 174.1-06.
    sql`SELECT /* tenant-safe: releer la fila propia (antes/despues del intento) es la asercion de "cero cambios" — filtrarla por gimnasio la volveria tautologica */ subscription_status AS status, plan_id, branch_id, end_date FROM subscriptions WHERE id = ${subscriptionId}`,
  );
  const f = filas[0];
  if (f === undefined) {
    return { status: null, planId: null, branchId: null, endDate: null };
  }
  return {
    status: f.status,
    planId: f.plan_id === null ? null : Number(f.plan_id),
    branchId: f.branch_id === null ? null : Number(f.branch_id),
    endDate: f.end_date === null ? null : String(f.end_date),
  };
}

// ─── Utilidad HTTP: change-plan (assignPlan ya lo expone _helpers.ts) ───────

async function cambiarPlan(
  userId: number,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

// ═══════════════════════════════════════════════════════════════════════════
// assignPlan
// ═══════════════════════════════════════════════════════════════════════════

describe("assignPlan — branchId de otro gimnasio en el payload (D1)", () => {
  const RUTA =
    "POST /api/admin/subscriptions/members/:userId/subscription/assign";

  it("userId/planId propios + branchId del gimnasio 2 → 404 'Sede no encontrada', CERO filas nuevas", async () => {
    const plan = await createPlan(app, adminToken, {
      name: `T175108 Plan Assign ${sufijo()}`,
      priceRegular: 12300,
    });
    const member = await createMember(app, {
      email: `t175108-assign-${sufijo()}@test.com`,
    });

    const antes = await contarSuscripcionesDeUsuario(member.id);
    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: gym2.branchId,
    });

    expect(
      res.statusCode,
      `${RUTA}: un branchId del gimnasio 2 en el payload tiene que rechazarse con 404 (D-06, ` +
        `jamas 403). Respuesta: ${JSON.stringify(res.body)}`,
    ).toBe(404);
    expect(
      (res.body as { message?: string }).message,
      `${RUTA}: el mensaje tiene que ser el mismo "Sede no encontrada" que arroja ` +
        `assertBranchDelGimnasio para cualquier sede ajena o inexistente.`,
    ).toBe("Sede no encontrada");

    const despues = await contarSuscripcionesDeUsuario(member.id);
    expect(
      despues,
      `${RUTA}: el rechazo del branchId ajeno no puede crear NINGUNA fila en subscriptions.`,
    ).toBe(antes);
  });

  it("control: branchId propio (1) procede (201) y la fila nace con ESE branch_id", async () => {
    const plan = await createPlan(app, adminToken, {
      name: `T175108 Plan Control Assign ${sufijo()}`,
      priceRegular: 15500,
    });
    const member = await createMember(app, {
      email: `t175108-control-assign-${sufijo()}@test.com`,
    });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: 1,
    });

    expect(
      res.statusCode,
      `${RUTA}: el guard nuevo no puede romper el alta con un branchId PROPIO valido. ` +
        `Respuesta: ${JSON.stringify(res.body)}`,
    ).toBe(201);
    const body = res.body as { id: number };
    const foto = await fotoDeSuscripcion(body.id);
    expect(
      foto.branchId,
      `${RUTA}: el insert tiene que usar el branch.id resuelto (1), no un numero distinto.`,
    ).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// changePlanNow (change-plan, startMode default/"now")
// ═══════════════════════════════════════════════════════════════════════════

describe("changePlanNow — branchId de otro gimnasio en el payload (D1)", () => {
  const RUTA =
    "POST /api/admin/subscriptions/members/:userId/subscription/change-plan (now)";

  it("userId/planId propios + branchId del gimnasio 2 → 404 'Sede no encontrada', CERO filas nuevas y la sub vigente vuelve a 'active'", async () => {
    const planA = await createPlan(app, adminToken, {
      name: `T175108 Plan A CPN ${sufijo()}`,
      priceRegular: 20000,
    });
    // Mismo precio que planA — evita el bloqueo de downgrade, no relacionado
    // con este guard.
    const planB = await createPlan(app, adminToken, {
      name: `T175108 Plan B CPN ${sufijo()}`,
      priceRegular: 20000,
    });
    const member = await createMember(app, {
      email: `t175108-cpn-${sufijo()}@test.com`,
    });

    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      branchId: 1,
    });
    expect(
      assignRes.statusCode,
      `Setup: el alta inicial (branchId propio) tiene que funcionar. Respuesta: ${JSON.stringify(assignRes.body)}`,
    ).toBe(201);
    const subId = (assignRes.body as { id: number }).id;

    const antesFoto = await fotoDeSuscripcion(subId);
    expect(antesFoto.status, "Precondicion: la sub inicial arranca activa.").toBe(
      "active",
    );
    const antesCount = await contarSuscripcionesDeUsuario(member.id);

    const res = await cambiarPlan(member.id, {
      planId: planB.id,
      branchId: gym2.branchId,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
    });

    expect(
      res.statusCode,
      `${RUTA}: un branchId del gimnasio 2 en el payload tiene que rechazarse con 404 (D-06, ` +
        `jamas 403). Respuesta: ${JSON.stringify(res.body)}`,
    ).toBe(404);
    expect((res.body as { message?: string }).message).toBe(
      "Sede no encontrada",
    );

    const despuesFoto = await fotoDeSuscripcion(subId);
    expect(
      despuesFoto,
      `${RUTA}: el rechazo no puede dejar cambios netos en la sub vigente — changePlanNow la cierra ` +
        `como 'changed' ANTES del guard y el catch de service.ts (~L4090) la restaura ante cualquier ` +
        `error; tiene que volver exactamente a 'active'.`,
    ).toEqual(antesFoto);

    const despuesCount = await contarSuscripcionesDeUsuario(member.id);
    expect(
      despuesCount,
      `${RUTA}: el rechazo del branchId ajeno no puede crear NINGUNA fila nueva en subscriptions.`,
    ).toBe(antesCount);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// changePlanAfterCurrent (change-plan, startMode=after_current)
// ═══════════════════════════════════════════════════════════════════════════

describe("changePlanAfterCurrent — branchId de otro gimnasio en el payload (D1)", () => {
  const RUTA =
    "POST /api/admin/subscriptions/members/:userId/subscription/change-plan (after_current)";

  it("userId/planId propios + branchId del gimnasio 2 → 404 'Sede no encontrada', CERO filas nuevas (ni 'scheduled') y la sub vigente sigue intacta", async () => {
    const planA = await createPlan(app, adminToken, {
      name: `T175108 Plan C CPAC ${sufijo()}`,
      priceRegular: 18000,
    });
    const planB = await createPlan(app, adminToken, {
      name: `T175108 Plan D CPAC ${sufijo()}`,
      priceRegular: 18000,
    });
    const member = await createMember(app, {
      email: `t175108-cpac-${sufijo()}@test.com`,
    });

    const assignRes = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      branchId: 1,
    });
    expect(
      assignRes.statusCode,
      `Setup: el alta inicial (branchId propio) tiene que funcionar. Respuesta: ${JSON.stringify(assignRes.body)}`,
    ).toBe(201);
    const subId = (assignRes.body as { id: number }).id;

    const antesFoto = await fotoDeSuscripcion(subId);
    expect(antesFoto.status, "Precondicion: la sub inicial arranca activa.").toBe(
      "active",
    );
    const antesCount = await contarSuscripcionesDeUsuario(member.id);

    const res = await cambiarPlan(member.id, {
      planId: planB.id,
      branchId: gym2.branchId,
      startMode: "after_current",
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
    });

    expect(
      res.statusCode,
      `${RUTA}: un branchId del gimnasio 2 en el payload tiene que rechazarse con 404 (D-06, ` +
        `jamas 403). changePlanAfterCurrent NO tenia NINGUN guard antes de este plan (gap total). ` +
        `Respuesta: ${JSON.stringify(res.body)}`,
    ).toBe(404);
    expect((res.body as { message?: string }).message).toBe(
      "Sede no encontrada",
    );

    // changePlanAfterCurrent no toca la sub vigente en ningun camino (a
    // diferencia de changePlanNow) — la foto tiene que ser IDENTICA, sin
    // necesidad de un catch compensatorio.
    const despuesFoto = await fotoDeSuscripcion(subId);
    expect(
      despuesFoto,
      `${RUTA}: el rechazo no puede dejar cambios en la sub vigente.`,
    ).toEqual(antesFoto);

    const despuesCount = await contarSuscripcionesDeUsuario(member.id);
    expect(
      despuesCount,
      `${RUTA}: el rechazo del branchId ajeno no puede crear NINGUNA fila nueva (ni siquiera 'scheduled').`,
    ).toBe(antesCount);
  });
});
