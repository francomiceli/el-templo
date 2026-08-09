/**
 * Fase 173 Plan 15 (D-12/WR-01) — el autorregistro público nace en el
 * gimnasio de la SEDE elegida, no en el `DEFAULT 1` de la columna.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * `POST /api/auth/register` es el ÚNICO camino de alta de socios que no pasa
 * por ningún staff ni por `request.scope`: el cliente elige una SEDE (no un
 * gimnasio) y hasta este plan el `insert(users)` ignoraba el gimnasio ya
 * resuelto tres líneas arriba (`branchTenantId`), así que el socio nacía
 * apuntando a una sede de un gimnasio con una fila de `users` que en
 * realidad pertenecía a otro (T-173-15-01/02). Este archivo es la prueba
 * DIRIGIDA que D-12 pidió — no un `describe` de la batería ISO-03: la
 * cobertura completa de `/register` como ruta (rate limiting, duplicados,
 * etc.) viaja con su propio módulo. Queda anotado como deuda con dueño más
 * abajo.
 *
 * LA EVIDENCIA SE LEE DE LA BASE, NO DEL STATUS
 * ----------------------------------------------
 * Un 201/200 con el `user.id` correcto no prueba nada sobre el `tenant_id`
 * real de la fila: la respuesta de `/register` ni siquiera proyecta esa
 * columna. `tenantDeLaFila` (local, mismo patrón que
 * `con-03-write-paths-tenant-id.test.ts` y `finance-gimnasio-dos.ts`) lee el
 * `tenant_id` real por id con SQL crudo.
 *
 * ⚠️ DEUDA DESCUBIERTA DURANTE ESTE PLAN, NO RESUELTA ACÁ (dueño: 173-14/D-13)
 * -----------------------------------------------------------------------------
 * El plan 173-15 solo migra `auth/routes.ts` y `wellhub/service.ts` (D-02:
 * cirugía mínima). `subscriptions/service.ts` (`assignPlan`) sigue sin
 * `tenantValues` en su insert de `subscriptions` (~L1593) — esa es
 * EXPLÍCITAMENTE la deuda D-13, con dueño declarado en
 * `173-14-PLAN.md` (wave 5, DESPUÉS de este plan, wave 3). Arreglarla acá
 * tendría un efecto colateral real y verificado: `assignPlan` insertaría la
 * sub con `tenant_id` correcto, la validación de "concepto enlazado" de
 * `TransactionService.create` (que SÍ filtra por gimnasio) empezaría a
 * encontrarla, y el `it` autodestructivo de
 * `test/tenancy/iso-03-finance-coach-load.test.ts:1326` —que hoy afirma un
 * 404 a propósito y está explícitamente marcado "dueño: fase 173"— se
 * pondría en rojo ANTES de que 173-14 lo convierta en su control positivo.
 * Por eso el caso de "el promo se aplica" de abajo verifica lo que HOY es
 * cierto (la sub nace, con el `branchId` correcto) y NO afirma el
 * `tenant_id` de `subscriptions` — ese cierre queda para 173-14.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  // Orden obligado (mismo criterio que toda la batería 2-tenant):
  // `cleanAllTestData` PRIMERO, `seedSecondTenant` arranca borrando su propio
  // rastro y sembrando la fila de `tenants` que la limpieza necesita viva.
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  // Obligatorio: la base la comparten los archivos del worker (isolate: false).
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Sufijo único por llamada: email/dni no pueden repetirse entre `it`. */
let secuencia = 0;
function unico(): string {
  secuencia += 1;
  return `${Date.now().toString(36)}${secuencia}${Math.random().toString(36).slice(2, 6)}`;
}

type TablaInspeccionada = "users" | "subscriptions";

/**
 * Lee el `tenant_id` REAL de una fila. SQL crudo a propósito: la pregunta es
 * "¿en qué gimnasio nació esta fila?", y filtrar por `tenant_id` acá volvería
 * la aserción tautológica (mismo razonamiento que `con-03` y
 * `finance-gimnasio-dos.ts:tenantDeLaFila`). Exención `tenant-safe` embebida en
 * el SQL (único canal que lee el sentinel): con `users` ya strict (173-25,
 * sonda), este SELECT hace throw sin ella.
 */
async function tenantDeLaFila(
  tabla: TablaInspeccionada,
  filaId: number,
): Promise<number | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila ES la asercion; filtrar por el la volveria tautologica */ tenant_id AS tenantId FROM ${sql.raw(tabla)} WHERE id = ${filaId}`,
  )) as unknown as [Array<{ tenantId: number | null }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ tenantId: number | null }>);
  if (filas.length === 0 || filas[0].tenantId === null) return null;
  return Number(filas[0].tenantId);
}

/** Payload mínimo válido de `POST /api/auth/register`, con overrides. */
function payloadDeAlta(overrides: Record<string, unknown> = {}) {
  const suf = unico();
  return {
    email: `alta-${suf}@test.com`,
    password: "password123",
    firstName: "Alta",
    lastName: `Test${suf}`,
    dni: `DNI-${suf}`,
    phone: `+54911${suf.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`,
    gender: "male" as const,
    ...overrides,
  };
}

async function registrarse(payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload,
  });
}

// ─── Precondición ────────────────────────────────────────────────────────────

describe("ancla del autorregistro (D-12/WR-01) — precondición de la batería", () => {
  it("las sedes de El Templo y del gimnasio 2 comparten país, así que el aislamiento no lo puede estar dando el country scope", async () => {
    const [templo] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(sql`${schema.branches.id} = 1`);
    expect(
      [templo?.country, "AR"],
      "El Templo (branchId=1, sembrado por test/setup.ts) tiene que ser AR: si el gimnasio 2 " +
        "estuviera en otro país, el aislamiento de abajo podría estar dándolo el country scope y " +
        "no el gimnasio.",
    ).toEqual(["AR", "AR"]);

    const [dos] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(sql`${schema.branches.id} = ${gym2.branchId}`);
    expect(dos?.country).toBe("AR");
  });
});

// ─── D-12: el usuario nace en el gimnasio de la sede elegida ───────────────

describe("ancla del autorregistro (D-12/WR-01) — el usuario nace en el gimnasio de su sede", () => {
  it("con una sede del gimnasio 2, el usuario nace en el gimnasio 2 (evidencia leída de la base)", async () => {
    const res = await registrarse(payloadDeAlta({ branchId: gym2.branchId }));

    expect(
      res.statusCode,
      `El registro con la sede del gimnasio ${TENANT_DOS} no devolvió 200: ${res.body}`,
    ).toBe(200);
    const body = JSON.parse(res.body) as { user: { id: number } };

    expect(
      await tenantDeLaFila("users", body.user.id),
      `El usuario ${body.user.id} nació con una sede del gimnasio ${TENANT_DOS} pero su fila de ` +
        `users no quedó en ese gimnasio. El insert(users) de POST /register dejó de estampar ` +
        `tenantId: branchTenantId (src/modules/auth/routes.ts) — es exactamente la fila cross-tenant ` +
        `persistente que D-12/WR-01 vino a cerrar.`,
    ).toBe(TENANT_DOS);
  });

  it("los datos del alta son consistentes con el gimnasio 2 (gimnasio, sede, status y origen juntos)", async () => {
    // Afirmar varias columnas EN EL MISMO toEqual: un alta que escribió la
    // mitad (p. ej. tenant_id correcto pero branch_id del body sin validar)
    // se ve igual que una limpia si se mira una sola columna a la vez.
    const res = await registrarse(payloadDeAlta({ branchId: gym2.branchId }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { user: { id: number } };

    const [fila] = await app.db.execute(
      sql`SELECT /* tenant-safe: leer el gimnasio y la sede REALES de la fila ES la asercion; filtrar por tenant la volveria tautologica */ tenant_id AS tenantId, branch_id AS branchId, status AS status,
                 branch_source AS branchSource
          FROM users WHERE id = ${body.user.id}`,
    );
    const filas = Array.isArray(fila)
      ? (fila as unknown as Array<Record<string, unknown>>)
      : (fila as unknown as Array<Record<string, unknown>>);
    expect(filas[0]).toEqual({
      tenantId: TENANT_DOS,
      branchId: gym2.branchId,
      status: "freemium",
      branchSource: "manual",
    });
  });

  it("control positivo: el mismo registro con una sede de El Templo nace en El Templo", async () => {
    const res = await registrarse(payloadDeAlta({ branchId: 1 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { user: { id: number } };

    expect(await tenantDeLaFila("users", body.user.id)).toBe(TENANT_TEMPLO);
  });

  it("fail-closed: una sede inexistente rechaza el alta con el motivo declarado, sin crear ningún usuario", async () => {
    const payload = payloadDeAlta({ branchId: 999999 });
    const res = await registrarse(payload);

    // La rama "sede pedida no encontrada" (:181 de auth/routes.ts) — el mismo
    // guard que impide que un branchId inventado del body cree una fila
    // cross-tenant o caiga en el DEFAULT 1. El motivo se afirma junto con el
    // status: un 400 sin el mensaje correcto podría venir de otra validación.
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Sucursal invalida");

    const [existente] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        sql`/* tenant-safe: el branchId es inexistente asi que no hay gimnasio que filtrar; la pregunta es si el alta dejo una fila en ALGUN tenant */ ${schema.users.email} = ${payload.email}`,
      );
    expect(
      existente,
      "El rechazo fail-closed no puede dejar una fila a medias: el usuario NO debe existir.",
    ).toBeUndefined();
  });
});

// ─── El promo se aplica en el contexto del gimnasio 2 ──────────────────────

describe("ancla del autorregistro (D-12/WR-01) — el promo se aplica en el gimnasio del socio", () => {
  it("un promoCode válido crea la suscripción del alta en el branch del gimnasio 2 (tenant_id de subscriptions: deuda 173-14/D-13, ver docblock)", async () => {
    // Plan con precio $0 (mismo patrón que promo-registration.test.ts): evita
    // que assignPlan intente cobrar y pise la validación de "concepto
    // enlazado" de TransactionService.create, que hoy SÍ filtra por gimnasio
    // y que — sin el fix de D-13 (173-14) — rechazaría el charge porque la
    // sub recién creada todavía no tiene el tenant_id correcto. No es lo que
    // este plan prueba: D-12 es sobre el ANCLA de `users`, no sobre el
    // charge de subscriptions.
    const [planGratis] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: `Plan promo gratis ${unico()}`,
        planTier: "other" as const,
        bookingMode: "flexible" as const,
        planCategory: "online_regular" as const,
        country: "AR",
        priceRegular: 0,
        priceZero: 0,
        durationDays: 30,
        isTrial: true,
      })
      .$returningId();

    const promoCode = `PROMO${unico()}`.toUpperCase().slice(0, 20);
    const now = new Date();
    await app.db.insert(schema.promoPlans).values({
      name: `Promo del gimnasio 2 ${unico()}`,
      promoCode,
      planDurationDays: 30,
      subscriptionPlanId: planGratis.id,
      startDate: new Date(now.getTime() - 86400000),
      expiryDate: new Date(now.getTime() + 86400000),
      promoType: "auto" as const,
      isActive: true,
    });

    const res = await registrarse(
      payloadDeAlta({ branchId: gym2.branchId, promoCode }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: number };
      promoApplied: boolean;
    };

    expect(
      body.promoApplied,
      `El registro con promoCode=${promoCode} no aplicó el promo: ${res.body}. Si assignPlan no ` +
        `encuentra al socio recién creado, revisar que el insert de users (T-173-15-01) siga ` +
        `estampando el tenant correcto.`,
    ).toBe(true);

    // Evidencia leída de la base, no del status 200: la sub tiene que existir
    // y colgar del socio y de la sede correctos.
    const [sub] = await app.db.execute(
      sql`SELECT user_id AS userId, branch_id AS branchId, plan_id AS planId
          FROM subscriptions WHERE user_id = ${body.user.id}`,
    );
    const filas = sub as unknown as Array<{
      userId: number;
      branchId: number;
      planId: number;
    }>;
    expect(
      filas[0],
      "El promoApplied=true del response no tiene respaldo en la base: no se creó ninguna fila de subscriptions.",
    ).toBeDefined();
    expect(filas[0].branchId).toBe(gym2.branchId);
    expect(filas[0].planId).toBe(planGratis.id);

    // También el usuario en sí, por supuesto, sigue naciendo en TENANT_DOS
    // (la aserción central de D-12) — este `it` no reemplaza a los de arriba,
    // los complementa con el flujo de promo encendido.
    expect(await tenantDeLaFila("users", body.user.id)).toBe(TENANT_DOS);
  });
});
