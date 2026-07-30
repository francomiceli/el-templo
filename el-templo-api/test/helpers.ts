/**
 * Test helpers for API integration tests.
 *
 * Provides createTestApp() using the existing buildApp() factory,
 * auth helpers for registering users and obtaining JWT tokens,
 * and a shared cleanup function for inter-file test isolation.
 */

import { buildApp } from "../src/app";
import type { BuildAppOptions } from "../src/app";
import { sql, getTableName, eq, and } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../src/db/schema";
import type { FastifyInstance } from "fastify";
// Fase 171 (ISO-02): `tenantValues` estampa el gimnasio en TODO insert sobre
// tabla gym-owned. Se importa por path DIRECTO a propósito: `shared/tenant.ts`
// no está en el barrel `src/modules/shared/index.ts` y sus 22+ call sites de
// producción también lo importan así.
import { tenantValues } from "../src/modules/shared/tenant";

/**
 * Create a Fastify test app instance connected to the per-worker test
 * database. DB_NAME is set by test/setup.ts (it includes a suffix derived
 * from VITEST_POOL_ID so parallel workers don't share state).
 *
 * NODE_ENV and JWT_SECRET are set by vitest.config.ts env block.
 *
 * Fase 171 (ISO-01): acepta las `BuildAppOptions` y las REENVÍA a `buildApp`.
 * Acá NO se cuelga ningún hook: el `onRoute` tiene que colgarse adentro de
 * `buildApp`, antes de sus `register`, o vería 0 rutas (y después de `ready()`
 * ni siquiera se puede colgar). Ver el docblock de `BuildAppOptions`.
 */
export async function createTestApp(
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = await buildApp(opts);
  await app.ready();
  return app;
}

/**
 * Date helpers for test fixtures. Keep dates within the assignPlan
 * validation window (-90 / +60 days from today) so production guardrails
 * apply uniformly to test code as well.
 */
export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function dateOffsetStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Phase 111 Plan 04 (REQ-5): autorregister blocks duplicate phones via
// last-10-digit normalization, so test fixtures must produce a globally
// unique last-10 per registration. We combine a millisecond timestamp with
// an in-process counter so back-to-back calls in the same ms still differ.
let __phoneSeq = 0;
function makeUniquePhoneLast10(): string {
  __phoneSeq = (__phoneSeq + 1) % 10000;
  // 10 digits = (timestamp last 6 digits) + (4-digit zero-padded counter)
  const tsTail = String(Date.now() % 1_000_000).padStart(6, "0");
  const seq = String(__phoneSeq).padStart(4, "0");
  return `${tsTail}${seq}`;
}

/**
 * Log in with email/password and return the JWT token.
 */
export async function getAuthToken(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  const body = JSON.parse(response.body);
  if (!body.token) {
    throw new Error(`Login failed for ${email}: ${response.body}`);
  }
  return body.token;
}

/**
 * Register a new user and return the token + user object.
 * Provides defaults for dni, phone, firstName, and lastName so existing
 * callers across all test files work without modification.
 */
export async function registerUser(
  app: FastifyInstance,
  data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    branchId: number;
    dni?: string;
    phone?: string;
    promoCode?: string;
    gender?: string;
  },
): Promise<{
  token: string;
  user: Record<string, unknown>;
  promoApplied?: boolean;
}> {
  // Phase 111 Plan 04 (REQ-5): /auth/register now blocks duplicate phones
  // (normalized last-10 digits, AR mobile convention). Generate a unique
  // last-10 per call so the dozens of legacy callers that don't override
  // phone don't collide with each other when they run sequentially in the
  // same per-worker DB. Mirrors the existing dni randomization above.
  const uniquePhoneLast10 = makeUniquePhoneLast10();
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      firstName: "Test",
      lastName: "User",
      dni: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      phone: `+549${uniquePhoneLast10}`,
      gender: "male",
      ...data,
    },
  });
  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(
      `registerUser failed for ${data.email}: ${response.statusCode} ${response.body}`,
    );
  }
  return JSON.parse(response.body);
}

/**
 * Comprehensive cleanup of ALL test data tables.
 *
 * Pulls a single dedicated connection from the pool and runs every
 * statement on it sequentially. This guarantees that:
 *   1. SET FOREIGN_KEY_CHECKS=0 stays in scope for every DELETE (the
 *      session variable is per-connection, so multiple pool.query() calls
 *      could pick different connections and re-enable FK checks mid-way).
 *   2. We never depend on mysql2's multi-statement support, which silently
 *      drops statements after the first in CI (verified empirically — works
 *      locally, fails in CI's MySQL 8.0 service container).
 *
 * Round-trip count: ~55. On a local socket this is ~1ms total, far cheaper
 * than the previous Drizzle-per-table version which paid pool acquire/release
 * overhead on every DELETE.
 *
 * Preserves only the seed data: admin@test.com user and the seeded
 * branches / spom_config rows.
 */
const TABLES_TO_CLEAN = [
  // Integración Wellhub (0186): bookings/slots/classes en orden de FKs, y el
  // log de eventos (sin FKs). users.gympass_id se limpia con el DELETE de
  // users de más abajo.
  schema.wellhubBookings,
  schema.wellhubSlots,
  schema.wellhubClasses,
  schema.wellhubEvents,
  // Phase 119 campaign tables. FK ordering (FK checks are disabled below, so
  // strictly cosmetic, but kept correct): events -> sends -> unsubscribes ->
  // campaigns, all before users.
  schema.campaignEvents,
  schema.campaignSends,
  schema.campaignUnsubscribes,
  schema.campaigns,
  // Notification + onboarding (FK to users)
  schema.pendingNotifications,
  schema.notificationPreferences,
  schema.deviceTokens,
  schema.notificationTemplates,
  schema.programEnrollments,
  schema.programContentBlocks,
  schema.checkInResponses,
  schema.onboardingAnalytics,
  schema.memberProfiles,
  schema.userSepaDetails,
  // Junction + leaf tables
  schema.userBranches,
  schema.blogPostTags,
  schema.bookings,
  schema.scheduleExceptions,
  schema.subscriptionScheduleChanges,
  schema.subscriptionSchedules,
  schema.completedSessions,
  schema.sessionTraces,
  schema.sessionBlocks,
  schema.sessionEditLogs,
  schema.sessionPrescriptions,
  schema.savedBlocks,
  schema.evaluationRequests,
  schema.formatCompatibility,
  schema.memberLogins,
  schema.refreshTokens,
  schema.userStatusHistory,
  // Tables referencing layer-3 parents
  schema.attendance,
  schema.auraTransactions,
  // Fase 157: vínculo de referido + registro auditable. FK a users/subscriptions
  // (FK checks off durante el DELETE), se limpian para no filtrar vínculos entre tests.
  schema.referralCredits,
  schema.referrals,
  // v5.5 follow-up: clics del CTA del A/B test — sin limpiar se acumularían entre tests.
  schema.referralCtaClicks,
  schema.memberNotes,
  schema.holidays,
  // Propuestas de mejora: FK a users -- sin limpiar, las filas huérfanas de un
  // test anterior rompen los counts y el prompt-status del siguiente.
  schema.improvementProposals,
  // Phase 117: finance tables were missing here, leaking financial_transactions
  // across tests and polluting exact-total assertions (revenue per currency).
  // FK checks are disabled below, so order vs subscriptions/balances is moot.
  schema.transactionLinks,
  schema.balances,
  schema.financialTransactions,
  // Fase 164: estado del TV por sede — sin limpiar se filtra entre archivos de
  // test. tv_class_state es UNIQUE por branch_id, así que una fila huérfana de
  // otro archivo hace fallar el insert del siguiente. Orden: pairings antes que
  // devices (FK device_id), y ambos antes de branches/users.
  schema.tvClassState,
  schema.tvPairings,
  schema.tvDevices,
  // Core entity tables
  schema.promoPlans,
  schema.subscriptions,
  schema.schedules,
  schema.subscriptionPlans,
  schema.programs,
  schema.auraBalances,
  schema.activities,
  schema.sessions,
  // Reference / config tables
  schema.blogPosts,
  schema.blogTags,
  schema.academyInquiries,
  schema.appWaitlist,
  schema.labsInquiries,
  schema.franchiseApplications,
  schema.gladiusInquiries,
  schema.gladiusProducts,
  schema.systemSettings,
  // SPOM reference tables
  schema.exercises,
  schema.formats,
  schema.routes,
  schema.spomRules,
  schema.intensityRules,
  schema.contractionRules,
  schema.weeklyRotator,
];

export async function cleanAllTestData(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    for (const t of TABLES_TO_CLEAN) {
      await conn.query(`DELETE FROM \`${getTableName(t)}\``);
    }
    // NULL-safe inequality: `email != 'admin@test.com'` returns NULL (not TRUE)
    // for rows with email IS NULL — Phase 102 trial users have null emails and
    // would survive cleanup, leaking IDs across test files within the same
    // vitest worker (per-worker DB, fileParallelism + isolate=false). The
    // `<=>` operator returns FALSE instead of NULL, so `NOT (email <=> ...)`
    // correctly catches both null and non-admin emails.
    await conn.query(
      "DELETE FROM `users` WHERE NOT (email <=> 'admin@test.com')",
    );
    await conn.query(
      "UPDATE `users` SET boarding_pass_used = 0 WHERE email = 'admin@test.com'",
    );
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

// =========================================================================
// Canonical fixture helpers (use these in new tests instead of reinventing)
//
// Existing tests have local copies of similar helpers. New tests should use
// these canonical versions; over time, files being touched can migrate.
// =========================================================================

/**
 * Default subscription plan payload. Override per test as needed.
 */
export const DEFAULT_TEST_PLAN = {
  name: "Test Plan",
  planTier: "flex",
  bookingMode: "flexible",
  priceRegular: 15000,
  priceZero: 10000,
  durationDays: 30,
  classesPerWeek: 3,
};

/**
 * Phase 138: ensure an efectivo caja exists for a branch created inside a test.
 *
 * TransactionService.create() now resolves cash_register_id from paymentMethod
 * and HARD-THROWS ("No existe caja efectivo para la sucursal X") when a `cash`
 * payment hits a branch with no efectivo caja. Branches seeded by test/setup.ts
 * get a caja there, but branches a test inserts at runtime do not — call this
 * right after inserting such a branch when the test routes/creates cash charges
 * against it. Idempotent (skips if a caja already exists for the branch).
 *
 * Fase 171 (WR-02): `tenantId` es opcional con DEFAULT 1 = El Templo, la misma
 * convención de retrocompatibilidad que `createStaffUser` / `createTestMember`.
 * `cash_registers` es gym-owned (`tenant_id` DEFAULT 1 desde la fase 167): sin
 * pasar el tenant, la caja de una sede del gimnasio 2 quedaba estampada en El
 * Templo (T-168-15) y el fixture mentiría. Para una sede del gimnasio 2:
 * `ensureEfectivoCaja(app, gym2.branchId, "ARS", TENANT_DOS)` — y acordate de
 * que `limpiarSegundoGimnasio` ya borra las cajas del gimnasio 2 en su orden
 * de FKs.
 */
export async function ensureEfectivoCaja(
  app: FastifyInstance,
  branchId: number,
  currency = "ARS",
  tenantId = 1,
): Promise<void> {
  const existing = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;
  await app.db.insert(schema.cashRegisters).values(
    tenantValues(
      { tenantId },
      {
        name: `Efectivo branch ${branchId}`,
        type: "efectivo" as const,
        branchId,
        currency,
        cutoffDate: "2020-01-01",
      },
    ),
  );
}

/**
 * Create a subscription plan via the admin API. Throws on non-201 so tests
 * fail fast at the setup step instead of cascading downstream.
 */
export async function createTestPlan(
  app: FastifyInstance,
  adminToken: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; [key: string]: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/subscriptions/plans",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { ...DEFAULT_TEST_PLAN, ...overrides },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createTestPlan failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body) as { id: number; [key: string]: unknown };
}

/**
 * Register a member via the auth API. Returns { id, token, email, ... } so
 * callers can both assert on the user and authenticate as them.
 *
 * Email defaults to a unique value so parallel/quick successive calls don't
 * collide; pass `overrides.email` when the test needs a specific one.
 *
 * Fase 171 (ISO-02): `overrides.tenantId` elige el gimnasio, con DEFAULT 1 = El
 * Templo. Sin ese override —o con el 1— el camino es el de SIEMPRE, byte por
 * byte: `POST /api/auth/register`. Eso es lo que preserva a los ~215 archivos
 * de test que ya llaman a este helper.
 *
 * POR QUÉ EL GIMNASIO 2 NO PUEDE IR POR LA API
 * --------------------------------------------
 * `POST /api/auth/register` NO conoce el tenant (cero menciones de tenant en
 * `src/modules/auth/routes.ts`): su insert cae en el DEFAULT 1 de la columna y
 * el "socio del gimnasio 2" sería en realidad un socio de El Templo. Que la
 * ruta lo conozca es ADO-06, fase 175 — esta fase la desbloquea, no al revés.
 * Por eso `tenantId !== 1` va por INSERT directo con `tenantValues`, igual que
 * `createEligibleFreemium` cuando la ruta pública no sirve.
 *
 * CONSECUENCIA ACEPTADA: el socio del gimnasio 2 NO tiene los efectos
 * colaterales de `register` (código de referido, `member_profiles`, promo
 * code). D-06 no los pide, y la alternativa —registrar por API y después
 * `UPDATE users SET tenant_id`— dejaría esas filas colaterales en el tenant 1,
 * o sea un fixture incoherente justo en lo que las fases 172-175 van a auditar.
 *
 * OVERRIDES EN EL CAMINO DEL GIMNASIO 2 (WR-04 de la review de fase)
 * ------------------------------------------------------------------
 * El INSERT directo honra las columnas planas que `register` también persiste
 * (`status`, `gender`, además de email/password/nombre/branchId/dni/phone).
 * Cualquier otro override —`promoCode` es el ejemplo típico: es un EFECTO del
 * register, no una columna— hace THROW en vez de descartarse en silencio: una
 * batería que crea "un socio activo del gimnasio 2" y recibe un freemium sin
 * aviso ejercería el estado equivocado y su verde no probaría nada. Si la
 * columna que necesitás es honrable, extendé `crearSocioDeOtroGimnasio`; si es
 * un efecto colateral de register, sembralo a mano después.
 *
 * El token sale de `getAuthToken` (login normal): el login resuelve por email
 * SIN filtro de tenant, así que funciona hoy — y por eso mismo el email del
 * socio del gimnasio 2 tiene que ser distinto de todos los del 1.
 */
export async function createTestMember(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<{
  id: number;
  token: string;
  email: string;
  [key: string]: unknown;
}> {
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const data = {
    email: `test-member-${uniqueSuffix}@test.com`,
    password: "pass123456",
    firstName: "Test",
    lastName: "Member",
    branchId: 1,
    ...overrides,
  } as {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    branchId: number;
    dni?: string;
    phone?: string;
    tenantId?: number;
    status?: NuevoUsuario["status"];
    gender?: NuevoUsuario["gender"];
  };
  // `tenantId` no es parte del payload de `/auth/register` (la ruta no lo
  // conoce): se saca del objeto ANTES de mandarlo, así el camino del tenant 1
  // llega a la API exactamente con las mismas claves que antes de la fase 171.
  const { tenantId, ...datosDeRegistro } = data;

  if (tenantId !== undefined && tenantId !== 1) {
    // WR-04: el INSERT directo NO pasa por /auth/register, así que un override
    // que ese camino no consume se perdería en silencio. Se chequean las CLAVES
    // que el caller pasó de verdad (`overrides`), no el objeto con defaults.
    const ignoradas = Object.keys(overrides).filter(
      (clave) => !OVERRIDES_SOPORTADOS_GIMNASIO_2.has(clave),
    );
    if (ignoradas.length > 0) {
      throw new Error(
        `createTestMember con tenantId=${tenantId} (≠ El Templo) va por INSERT ` +
          `directo y NO soporta estos overrides: ${ignoradas.sort().join(", ")}. ` +
          `Descartarlos en silencio dejaría al test ejerciendo un estado que ` +
          `cree haber configurado (WR-04). Si es una columna plana de users, ` +
          `extendé crearSocioDeOtroGimnasio en test/helpers.ts; si es un efecto ` +
          `colateral de /auth/register (promoCode, member_profiles, código de ` +
          `referido), sembralo a mano después de crear el socio.`,
      );
    }
    return crearSocioDeOtroGimnasio(app, {
      ...datosDeRegistro,
      tenantId,
      uniqueSuffix,
    });
  }

  const result = await registerUser(app, datosDeRegistro);
  const user = result.user as { id: number; [key: string]: unknown };
  return {
    id: user.id,
    token: result.token,
    email: data.email,
    ...user,
  };
}

/** Forma de insert de `users`, para tipar los overrides honrados abajo. */
type NuevoUsuario = typeof schema.users.$inferInsert;

/**
 * WR-04: las únicas claves de `overrides` que `createTestMember` acepta cuando
 * `tenantId !== 1`. Todo lo demás hace throw en vez de descartarse en silencio
 * — ver el docblock de {@link createTestMember}. Si agregás una clave acá,
 * agregala también al tipo y al INSERT de {@link crearSocioDeOtroGimnasio}.
 */
const OVERRIDES_SOPORTADOS_GIMNASIO_2: ReadonlySet<string> = new Set([
  "email",
  "password",
  "firstName",
  "lastName",
  "branchId",
  "dni",
  "phone",
  "tenantId",
  "status",
  "gender",
]);

/**
 * Socio de un gimnasio distinto de El Templo, por INSERT directo.
 *
 * Espeja las columnas que `POST /api/auth/register` escribe (rol `member`,
 * nivel `kairos`, status `freemium`, `branch_source = 'manual'`) para que la
 * fila sea indistinguible de una registrada por la API en todo lo que a
 * lecturas se refiere — lo único que cambia es de QUÉ gimnasio es. Ver el
 * docblock de {@link createTestMember} para el porqué de este camino.
 *
 * `status` y `gender` son las dos columnas planas que el register también
 * persiste y que este camino honra cuando vienen como override (WR-04):
 * `status` con default `freemium` (el que pone register) y `gender` solo si es
 * explícito — sin override la columna queda NULL, a diferencia del camino de
 * register cuyo payload de test siempre manda "male".
 *
 * `dni` y `phone` se generan únicos: la unique de `dni` ya es compuesta con el
 * tenant desde la fase 168, pero el chequeo de teléfono duplicado de la fase
 * 111 sigue siendo global y no queremos que un fixture del gimnasio 2 le
 * bloquee un registro al 1.
 */
async function crearSocioDeOtroGimnasio(
  app: FastifyInstance,
  data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    branchId: number;
    dni?: string;
    phone?: string;
    tenantId: number;
    uniqueSuffix: string;
    status?: NuevoUsuario["status"];
    gender?: NuevoUsuario["gender"];
  },
): Promise<{
  id: number;
  token: string;
  email: string;
  [key: string]: unknown;
}> {
  const passwordHash = await argon2.hash(data.password);
  const firstName = data.firstName ?? "Test";
  const lastName = data.lastName ?? "Member";

  const [result] = await app.db
    .insert(schema.users)
    .values(
      tenantValues(
        { tenantId: data.tenantId },
        {
          email: data.email,
          passwordHash,
          firstName,
          lastName,
          dni: data.dni ?? `T${data.uniqueSuffix}`,
          phone: data.phone ?? `+549${makeUniquePhoneLast10()}`,
          role: "member" as const,
          branchId: data.branchId,
          branchUpdatedAt: new Date(),
          branchSource: "manual" as const,
          level: "kairos" as const,
          status: data.status ?? ("freemium" as const),
          // Solo si vino explícito: sin override se preserva el NULL histórico
          // de este camino (iso-02 lo usa de discriminador entre los dos
          // caminos del helper).
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
        },
      ),
    )
    .$returningId();

  const token = await getAuthToken(app, data.email, data.password);

  return {
    id: result.id,
    token,
    email: data.email,
    firstName,
    lastName,
    role: "member",
    branchId: data.branchId,
    tenantId: data.tenantId,
  };
}

/**
 * Assign a subscription plan to a member. Returns both statusCode and body
 * (does NOT throw on non-201) so tests can assert on 409 / 400 / etc.
 */
export async function assignTestPlan(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  planId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/subscriptions/members/${userId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...overrides,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/**
 * Seed an AURA balance for a user. Idempotent (UPSERT).
 */
export async function seedAuraBalance(
  app: FastifyInstance,
  userId: number,
  amount: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO aura_balances (user_id, balance) VALUES (${userId}, ${amount})
        ON DUPLICATE KEY UPDATE balance = ${amount}`,
  );
}

/**
 * Create a staff user directly in the database (bypasses API auth).
 * Returns the created user's ID.
 *
 * Phase 110: `users.country` (varchar(2)) is required for admin/gestion to get
 * a non-null `scope.country` since the country-scope hook now reads
 * `users.country` directly (no longer a JOIN to branches). For backward
 * compatibility with the dozens of existing tests that pre-date Phase 110, when
 * `country` is not explicitly passed AND the role is admin/gestion, this helper
 * derives the country from the user's branch — mirroring the production
 * migration-0107 backfill (`UPDATE users SET country = (SELECT country FROM
 * branches WHERE id = users.branch_id) WHERE role IN ('admin','gestion')`).
 * Owner stays NULL (global access). Coach/recepción/member stay NULL.
 *
 * Fase 171 (ISO-02): `tenantId` es opcional y su DEFAULT es 1 = El Templo, así
 * que los ~215 archivos de test que ya llaman a este helper no cambian ni una
 * línea (mismo criterio de retrocompatibilidad que el `country?` de la Phase
 * 110, acá arriba). Los DOS inserts —`users` y `user_branches`— pasan por
 * `tenantValues`, o sea que estampan el gimnasio EXPLÍCITO incluso cuando es el
 * 1: `tenant_id` tiene DEFAULT 1 desde la fase 167 y un insert que se olvide de
 * la columna cae en El Templo sin avisar (T-168-15), con lo cual un test de
 * aislamiento pasaría en verde probando exactamente nada.
 *
 * Antes de esto, el único precedente del repo (`test/tv/tv-pairing-tenant.test.ts`,
 * fase 169-06) reasignaba el staff con un `UPDATE users SET tenant_id` a mano
 * después del insert. Ese workaround queda obsoleto: pasar `tenantId` acá.
 */
export async function createStaffUser(
  app: FastifyInstance,
  data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    branchId: number;
    country?: "AR" | "ES" | null;
    /** Fase 171 (ISO-02). Default 1 = El Templo: los call sites previos no cambian. */
    tenantId?: number;
  },
): Promise<number> {
  const ctx = { tenantId: data.tenantId ?? 1 };
  const passwordHash = await argon2.hash(data.password);

  // Phase 110 backfill mirror: when admin/gestion is created without an
  // explicit `country`, look it up from the branch (matches migration 0107
  // semantics so existing tests continue to work).
  let country: "AR" | "ES" | null = data.country ?? null;
  if (country === null && (data.role === "admin" || data.role === "gestion")) {
    const [branchRow] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.id, data.branchId))
      .limit(1);
    if (branchRow?.country === "AR" || branchRow?.country === "ES") {
      country = branchRow.country;
    }
  }

  const [result] = await app.db
    .insert(schema.users)
    .values(
      tenantValues(ctx, {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as
          | "coach"
          | "admin"
          | "owner"
          | "gestion"
          | "recepcion",
        branchId: data.branchId,
        country,
      }),
    )
    .$returningId();

  // Phase 110 backfill mirror: when coach/recepcion is created, auto-insert
  // their working sede into user_branches (matches migration 0107 semantics
  // so existing tests that rely on cardinality + canAccessBranch continue to
  // work without explicit user_branches setup).
  if (data.role === "coach" || data.role === "recepcion") {
    await app.db
      .insert(schema.userBranches)
      .values(
        tenantValues(ctx, { userId: result.id, branchId: data.branchId }),
      );
  }

  return result.id;
}

// =========================================================================
// Phase 119 campaign / trial fixtures
// =========================================================================

/**
 * Create a freemium user that is ELIGIBLE for the trial-session campaign and
 * for self-service trial reservation (Phase 119, D-08/D-10/D-20).
 *
 * Eligibility predicate (matches the audience query minus email/unsubscribe):
 *   - status = 'freemium'
 *   - a non-null email (so the campaign can address them)
 *   - created_at older than 3 days (D-10 freshness guard)
 *   - no active/paused/scheduled subscription
 *   - no non-cancelled is_trial booking
 *
 * Inserts the user directly (bypasses /register, which forces freemium + a
 * fresh created_at) so the test can pin an old created_at. Returns the user id
 * and the email snapshot used by campaign_sends.
 */
export async function createEligibleFreemium(
  app: FastifyInstance,
  overrides: {
    email?: string;
    createdAt?: Date;
    branchId?: number;
    // Fase 165 (D-04): seed a phone when the test needs an already-phoned lead.
    // Default undefined → phone stays null (leads with no phone still exist).
    phone?: string | null;
  } = {},
): Promise<{ id: number; email: string }> {
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = overrides.email ?? `freemium-${uniqueSuffix}@test.com`;
  // Default created_at = 10 days ago (comfortably older than the 3-day guard).
  const createdAt =
    overrides.createdAt ?? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const passwordHash = await argon2.hash("pass123456");

  const [result] = await app.db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      firstName: "Free",
      lastName: "Mium",
      role: "member",
      branchId: overrides.branchId ?? 1,
      status: "freemium",
      createdAt,
      phone: overrides.phone ?? null,
    })
    .$returningId();

  return { id: result.id, email };
}

/**
 * Create a campaign row directly in the DB. Returns the campaign id.
 */
export async function createTestCampaign(
  app: FastifyInstance,
  createdBy: number,
  overrides: Partial<{
    name: string;
    subject: string;
    status: string;
    country: string | null;
  }> = {},
): Promise<number> {
  const [result] = await app.db
    .insert(schema.campaigns)
    .values({
      name: overrides.name ?? "Test Campaign",
      subject: overrides.subject ?? "Tu sesión de prueba gratis",
      status: overrides.status ?? "draft",
      createdBy,
      country: overrides.country ?? null,
    })
    .$returningId();
  return result.id;
}

/**
 * Create a campaign_send row directly in the DB. Returns the send id.
 */
export async function createTestSend(
  app: FastifyInstance,
  campaignId: number,
  userId: number,
  email: string,
  overrides: Partial<{ status: string; resendMessageId: string }> = {},
): Promise<number> {
  const [result] = await app.db
    .insert(schema.campaignSends)
    .values({
      campaignId,
      userId,
      email,
      status: overrides.status ?? "sent",
      resendMessageId: overrides.resendMessageId ?? null,
    })
    .$returningId();
  return result.id;
}
