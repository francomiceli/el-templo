/**
 * Fase 173 Plan 26 (ISO-03, ADO-02) — la FICHA COMPLETA de un socio en el
 * segundo gimnasio (y su equivalente ajeno en El Templo), sembrable en una
 * llamada, y la evidencia leída de la BASE.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * `test/fixtures/second-tenant.ts` (171-04) siembra el ESQUELETO del gimnasio
 * 2 (sede, actividad, plan, horario, staff y 2 socios) pero a propósito NO
 * siembra ficha: sin perfil, notas, historial de estado, logins ni SEPA, las
 * 9 rutas de listado/búsqueda/export de members no tienen nada real que
 * devolver. Este archivo es ese complemento — gemelo de
 * `finance-gimnasio-dos.ts` — hecho una vez y compartido por los 3 planes de
 * la batería (173-26/27/28).
 *
 * EL ORDEN ES OBLIGADO, NO COSMETICO
 * -----------------------------------
 * ```ts
 * beforeEach(async () => {
 *   await cleanAllTestData(app);                        // 1. vacía TODAS las tablas del módulo
 *   await limpiarSociosDeLaBateria(app);                 // 2. ANTES de seedSecondTenant (ver abajo)
 *   gym2 = await seedSecondTenant(app);                  // 3. el esqueleto del gimnasio 2
 *   templo = await sembrarSocioTemplo(app);              // 4. el recurso ajeno (gimnasio 1)
 *   dos = await sembrarSociosGimnasioDos(app, gym2);      // 5. lo propio del gimnasio 2
 * });
 *
 * afterAll(async () => {
 *   await cleanAllTestData(app);
 *   await limpiarSociosDeLaBateria(app);
 *   await limpiarSegundoGimnasio(app);
 *   await app.close();
 * });
 * ```
 *
 * QUE LIMPIA QUIEN
 * ----------------
 * Las 8 tablas de `TENANT_STRICT_MODULES.members` (`users`, `member_profiles`,
 * `member_notes`, `user_status_history`, `member_logins`, `user_sepa_details`,
 * `user_branches`, `audit_log`) — más `balances` y `completed_sessions`, que
 * este archivo también siembra (ver "QUÉ SIEMBRA Y POR QUÉ" abajo) — están
 * TODAS en `TABLES_TO_CLEAN` (`test/helpers.ts`), así que `cleanAllTestData`
 * ya las vacía por completo (de TODOS los gimnasios) en cada `beforeEach`. Lo
 * único que sobrevive entre archivos del mismo worker (`isolate: false`) es
 * `branches` (gym-owned, fuera de `TABLES_TO_CLEAN`): las de El Templo porque
 * nadie las limpia, las del gimnasio 2 porque `limpiarSegundoGimnasio` recién
 * corre DESPUÉS. Por eso {@link limpiarSociosDeLaBateria} existe y por eso
 * solo se ocupa de `branches` — no es un descuido, es lo único que hace falta
 * dado lo que ya limpian `cleanAllTestData` y `limpiarSegundoGimnasio`.
 *
 * QUE SIEMBRA Y POR QUE (más allá de la letra literal del plan)
 * ---------------------------------------------------------------
 * El plan pide notas/perfil/historial/logins/SEPA. Esta batería (Task 2)
 * necesita además, para afirmar el contrato de las 9 rutas:
 *   - `balances`: `GET /api/admin/members` devuelve `totalDebtByCurrency`, un
 *     AGREGADO — sin una fila propia de deuda no hay forma de distinguir "no
 *     suma nada" de "no filtra nada". Importes de ÓRDENES DE MAGNITUD
 *     distintas (T-172-17-01 aplicado a members): si el agregado de un
 *     gimnasio sumara la fila del otro, el número resultante sería
 *     evidentemente otro, no un "de más" sutil.
 *   - `completed_sessions`: `GET /:userId/session-levels` solo tiene algo
 *     real que aislar si hay sesiones completadas que contar.
 *   - Una sede ES + un socio SEPA + (para el gimnasio 2) un actor `owner`:
 *     `GET /export-sepa` filtra SIEMPRE `branches.country = 'ES'` y además
 *     exige `MEMBER_LIFECYCLE_ROLES` con `scope.country === 'ES'` para
 *     cualquier actor no-owner (`src/modules/members/routes.ts:377`) — el
 *     actor `admin` que ya crea `seedSecondTenant` tiene su sede propia en
 *     AR (precondición #1 de la batería: las dos sedes comparten país), así
 *     que NO sirve para este caso. Un actor `owner` bypassea el gate de país
 *     (`!scope.isOwner`), y una sede ES dedicada es la única forma de que la
 *     ruta tenga algo que devolver para CUALQUIER gimnasio.
 *   - La sede virtual "Templo Online" del gimnasio 2 (ver abajo): no la
 *     ejercita ninguna de las 9 rutas de esta batería, pero es un insumo de
 *     onboarding que el propio plan pide dejar resuelto acá.
 *
 * ONBOARDING DEL GIMNASIO NUEVO (doc 07 §1.4)
 * --------------------------------------------
 * `resolveUserBranchId` (`src/modules/finance/coach-load-routes.ts`) cae en
 * un fallback que busca, POR NOMBRE y ya scopeado por gimnasio, una sede
 * `"Templo Online"` cuando el socio no tiene `branchId`. `second-tenant.ts`
 * (171-04) nunca sembró esa sede virtual para el gimnasio 2 — no hacía falta
 * hasta que un módulo la necesitara. Este archivo la agrega (marcada, para
 * que {@link limpiarSociosDeLaBateria} pueda borrarla si alguna vez hiciera
 * falta hacerlo fuera de `limpiarSegundoGimnasio`) y lo deja anotado acá y en
 * el SUMMARY como insumo del checklist de onboarding — NO como fix de la
 * batería: ninguna de las 9 rutas de este plan la ejercita.
 *
 * VALORES IRREPETIBLES Y DE OTRO ORDEN DE MAGNITUD
 * --------------------------------------------------
 * Nombre/apellido/DNI/teléfono de cada ficha son ÚNICOS por corrida (sufijo).
 * A propósito, El Templo y el gimnasio 2 comparten el MISMO apellido
 * ("Aislado173"): es exactamente el caso que el piloto encontró más caro (un
 * apellido que cualquier gimnasio puede tener) y que un id ajeno simplemente
 * no matchea nunca — si esto pasara en verde con un apellido único por
 * gimnasio, no probaría lo mismo. El importe de deuda y el nivel/cantidad de
 * sesiones completadas son de magnitud u origen claramente distinto entre
 * los dos gimnasios (ver arriba).
 *
 * @see .docs/saas-multitenancy/07-receta-adopcion.md (lo escribe el plan 173-29)
 * @see .planning/phases/173-.../173-CONTEXT.md — D-09/D-10
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  createTestMember,
  createStaffUser,
  getAuthToken,
  todayStr,
} from "../helpers";
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
 * Prefijo de nombre de TODA fila que este fixture crea en `branches` (la
 * única tabla del archivo que ningún `TABLES_TO_CLEAN` global vacía).
 */
export const MARCA_ISO03M = "ISO03M";

/**
 * Apellido COMPARTIDO a propósito entre El Templo y el gimnasio 2 (ver el
 * docblock del archivo, sección "VALORES IRREPETIBLES…"). El nombre y el
 * DNI/teléfono sí son únicos por corrida.
 */
const APELLIDO_COMPARTIDO = "Aislado173";

const EMAIL_ADMIN_SEMILLA = "admin@test.com";

/** Sufijo único por corrida, mismo generador que `second-tenant.ts`. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

let __telSeq = 0;
/**
 * Teléfono único (últimos 10 dígitos). El de `test/helpers.ts` no se exporta
 * (`makeUniquePhoneLast10`) y `POST /auth/register` bloquea teléfonos
 * duplicados GLOBALMENTE (Fase 111, REQ-5) — el socio de El Templo de este
 * archivo pasa por ese endpoint de verdad, así que necesita su propio
 * generador único.
 */
function telefonoUnico(): string {
  __telSeq = (__telSeq + 1) % 10000;
  const cola = String(Date.now() % 1_000_000).padStart(6, "0");
  const seq = String(__telSeq).padStart(4, "0");
  return `+549${cola}${seq}`;
}

// ─── Forma de los handles ────────────────────────────────────────────────────

/** Ficha SEPA: sede ES + socio + fila de `user_sepa_details`. */
export interface FichaSepa {
  branchId: number;
  userId: number;
  sepaId: number;
  firstName: string;
  lastName: string;
  iban: string;
  debtorName: string;
}

/** El recurso ajeno: la ficha completa de un socio de El Templo. */
export interface FichaTemplo {
  userId: number;
  branchId: number;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  email: string;
  profileId: number;
  noteId: number;
  noteAuthorId: number;
  noteContent: string;
  statusHistoryId: number;
  loginId: number;
  balanceId: number;
  debtAmount: number;
  sessionLevel: "omega";
  sessionCount: number;
  /** Sede ES + socio SEPA propios de El Templo (recurso ajeno de export-sepa). */
  sepa: FichaSepa;
}

/** La ficha completa de un socio del gimnasio 2. */
export interface FichaGimnasioDos {
  userId: number;
  branchId: number;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  email: string;
  profileId: number;
  noteId: number;
  noteAuthorId: number;
  noteContent: string;
  statusHistoryId: number;
  loginId: number;
  balanceId: number;
  debtAmount: number;
  sessionLevel: "sigma";
  sessionCount: number;
  /** Sede virtual "Templo Online" del gimnasio 2 (onboarding, doc 07 §1.4). */
  virtualBranchId: number;
  /** Sede ES + socio SEPA + actor `owner` propios del gimnasio 2. */
  sepa: FichaSepa & { ownerToken: string; ownerId: number };
}

// ─── Evidencia leida de la BASE ──────────────────────────────────────────────

/**
 * Las tablas que {@link tenantDeLaFila}/{@link campoDeLaFila} saben leer.
 * Unión CERRADA a propósito (mismo molde que `TablaStrict` de
 * `finance-gimnasio-dos.ts`): un `sql.raw` con un nombre de tabla libre sería
 * una puerta abierta a construir SQL desde datos.
 */
export type TablaDelModulo =
  | "users"
  | "branches"
  | "member_profiles"
  | "member_notes"
  | "user_status_history"
  | "member_logins"
  | "user_sepa_details";

/** Columnas que {@link campoDeLaFila} sabe leer. Unión cerrada por el mismo motivo. */
export type ColumnaInspeccionable =
  | "first_name"
  | "last_name"
  | "dni"
  | "content"
  | "iban"
  | "debtor_name"
  | "name";

/**
 * Normaliza la salida de `app.db.execute` (mysql2 devuelve `[filas, meta]`).
 * Mismo idioma que `finance-gimnasio-dos.ts`.
 */
async function consultar<T>(app: FastifyInstance, consulta: SQL): Promise<T[]> {
  const resultado = (await app.db.execute(consulta)) as unknown as [T[]];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as T[]);
  return filas ?? [];
}

/**
 * El `tenant_id` REAL de una fila, leído de la base por id.
 *
 * ESTA ES LA UNICA EVIDENCIA QUE VALE en la batería ISO-03. La exención
 * `tenant-safe` va EMBEBIDA en el SQL (único canal que el sentinel lee):
 * leer el `tenant_id` de la fila ES la aserción, filtrarla la volvería
 * tautológica.
 */
export async function tenantDeLaFila(
  app: FastifyInstance,
  tabla: TablaDelModulo,
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
 * El valor REAL de una columna de una fila, leído de la base por id.
 * Mismo motivo de exención que {@link tenantDeLaFila}.
 */
export async function campoDeLaFila(
  app: FastifyInstance,
  tabla: TablaDelModulo,
  columna: ColumnaInspeccionable,
  id: number,
): Promise<string | null> {
  const filas = await consultar<{ v: unknown }>(
    app,
    sql`SELECT /* tenant-safe: releer la fila (ajena o propia) es la asercion de contenido; filtrarla por gimnasio la volveria tautologica */ ${sql.raw(columna)} AS v FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  );
  if (filas[0] === undefined || filas[0].v === null) return null;
  return String(filas[0].v);
}

// ─── Siembra: ficha SEPA (compartida por los dos gimnasios) ─────────────────

/** Resuelve el id del admin semilla de El Templo, por email (nunca por id fijo). */
async function adminSemillaId(app: FastifyInstance): Promise<number> {
  const [fila] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX_TEMPLO),
        eq(schema.users.email, EMAIL_ADMIN_SEMILLA),
      ),
    )
    .limit(1);
  if (!fila) {
    throw new Error(
      `members-gimnasio-dos: no existe ${EMAIL_ADMIN_SEMILLA}. Lo siembra test/setup.ts ` +
        `y es el unico usuario que sobrevive a cleanAllTestData: sin el no hay autor valido ` +
        `para la nota de El Templo.`,
    );
  }
  return fila.id;
}

/**
 * Crea la sede ES + el socio + su `user_sepa_details`, en el gimnasio dado.
 *
 * `branches.code` es unique compuesta (tenant_id, code): el sufijo evita que
 * dos corridas del mismo worker choquen.
 */
async function sembrarFichaSepa(
  app: FastifyInstance,
  ctx: TenantContext,
  etiqueta: string,
): Promise<FichaSepa> {
  const suf = sufijo();

  const [sede] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(ctx, {
        name: `${MARCA_ISO03M} Sede ES ${etiqueta} ${suf}`,
        code: `ES${etiqueta.slice(0, 3).toUpperCase()}${suf}`.slice(0, 20),
        country: "ES",
        isVirtual: false,
        isActive: true,
      }),
    )
    .$returningId();

  const firstName = `Sepa${etiqueta}173`;
  const lastName = "Bancario173";
  const socio = await createTestMember(app, {
    email: `sepa-${etiqueta.toLowerCase()}-${suf}@test.com`,
    password: "pass123456",
    firstName,
    lastName,
    branchId: sede.id,
    dni: `SEPA${etiqueta.slice(0, 2).toUpperCase()}${suf}`,
    phone: telefonoUnico(),
    tenantId: ctx.tenantId,
  });

  const debtorName = `Deudor ${etiqueta} ${suf}`;
  // IBAN no validado a nivel de insert directo (la validacion mod-97 vive en
  // MemberService.updateMember): un string unico alcanza para la asercion de
  // contenido del export.
  const iban = `ES00${etiqueta.slice(0, 2).toUpperCase()}${suf}`.slice(0, 34);

  const [sepa] = await app.db
    .insert(schema.userSepaDetails)
    .values(
      tenantValues(ctx, {
        userId: socio.id,
        debtorName,
        address: `Calle ${etiqueta} 123`,
        postalCode: "28001",
        city: "Madrid",
        country: "ES",
        nif: `NIF${suf}`.slice(0, 20),
        iban,
      }),
    )
    .$returningId();

  return {
    branchId: sede.id,
    userId: socio.id,
    sepaId: sepa.id,
    firstName,
    lastName,
    iban,
    debtorName,
  };
}

// ─── Siembra: El Templo (recurso ajeno) ─────────────────────────────────────

/**
 * Siembra la ficha completa de un socio de El Templo: es el recurso AJENO que
 * el staff del gimnasio 2 no tiene que poder ver, buscar ni exportar.
 *
 * NO limpia: la limpieza es {@link limpiarSociosDeLaBateria} y corre ANTES de
 * `seedSecondTenant` (ver el docblock del archivo).
 */
export async function sembrarSocioTemplo(
  app: FastifyInstance,
): Promise<FichaTemplo> {
  const suf = sufijo();
  const authorId = await adminSemillaId(app);

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
      "sembrarSocioTemplo: El Templo no tiene ninguna sede no virtual. La siembra " +
        "test/setup.ts (codigos TEST/ONLINE) — revisar ese archivo.",
    );
  }

  const firstName = `AjenoTemplo173`;
  const lastName = APELLIDO_COMPARTIDO;
  const dni = `TPL${suf}`;
  const phone = telefonoUnico();
  const email = `ajeno-templo-${suf}@test.com`;

  const socio = await createTestMember(app, {
    email,
    password: "pass123456",
    firstName,
    lastName,
    branchId: sede.id,
    dni,
    phone,
  });

  const [profile] = await app.db
    .insert(schema.memberProfiles)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: socio.id,
        segment: "regular" as const,
        currentStreak: 7,
      }),
    )
    .$returningId();

  const noteContent = `${MARCA_ISO03M} nota de El Templo ${suf}`;
  const [note] = await app.db
    .insert(schema.memberNotes)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: socio.id,
        authorId,
        content: noteContent,
      }),
    )
    .$returningId();

  const [statusHistory] = await app.db
    .insert(schema.userStatusHistory)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: socio.id,
        fromStatus: null,
        toStatus: "activo" as const,
        source: "admin",
      }),
    )
    .$returningId();

  const [login] = await app.db
    .insert(schema.memberLogins)
    .values(tenantValues(CTX_TEMPLO, { userId: socio.id }))
    .$returningId();

  // Deuda: importe CHICO a proposito — la contraparte del gimnasio 2 es de
  // otro orden de magnitud (ver docblock del archivo).
  const debtAmount = 111;
  const [balance] = await app.db
    .insert(schema.balances)
    .values(
      tenantValues(CTX_TEMPLO, {
        memberId: socio.id,
        targetKind: "debt_balance" as const,
        targetId: 0,
        currency: "ARS",
        amount: debtAmount,
      }),
    )
    .$returningId();

  const sessionCount = 2;
  const hoy = todayStr();
  for (let i = 0; i < sessionCount; i++) {
    await app.db.insert(schema.completedSessions).values(
      tenantValues(CTX_TEMPLO, {
        userId: socio.id,
        dayId: `W1-lunes-omega-${i}`,
        sessionLevel: "omega" as const,
        date: hoy,
        branchId: sede.id,
        startedAt: new Date(),
        completedAt: new Date(),
        blocksCompleted: [],
      }),
    );
  }

  const sepa = await sembrarFichaSepa(app, CTX_TEMPLO, "Templo");

  return {
    userId: socio.id,
    branchId: sede.id,
    firstName,
    lastName,
    dni,
    phone,
    email,
    profileId: profile.id,
    noteId: note.id,
    noteAuthorId: authorId,
    noteContent,
    statusHistoryId: statusHistory.id,
    loginId: login.id,
    balanceId: balance.id,
    debtAmount,
    sessionLevel: "omega",
    sessionCount,
    sepa,
  };
}

// ─── Siembra: gimnasio 2 (lo propio) ────────────────────────────────────────

/**
 * Siembra la ficha completa de un socio DEDICADO del gimnasio 2 (no reusa
 * `gym2.socios[0/1]`: esta ficha necesita nombre/DNI/teléfono propios y
 * controlados por este archivo para que las aserciones de contenido —
 * export, check-dni, check-duplicates— tengan un valor conocido de
 * antemano, sin tener que releer la siembra de `second-tenant.ts`).
 *
 * Va SIEMPRE después de `seedSecondTenant` (necesita `gym2.branchId` y
 * `gym2.adminId`) y de {@link sembrarSocioTemplo} (que deja el rastro
 * limpio de la corrida anterior).
 */
export async function sembrarSociosGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<FichaGimnasioDos> {
  const suf = sufijo();

  const firstName = `PropioGdos173`;
  const lastName = APELLIDO_COMPARTIDO;
  const dni = `GD2${suf}`;
  const phone = telefonoUnico();
  const email = `propio-g2-${suf}@test.com`;

  const socio = await createTestMember(app, {
    email,
    password: "pass123456",
    firstName,
    lastName,
    branchId: gym2.branchId,
    dni,
    phone,
    tenantId: TENANT_DOS,
  });

  const [profile] = await app.db
    .insert(schema.memberProfiles)
    .values(
      tenantValues(CTX_DOS, {
        userId: socio.id,
        segment: "optima" as const,
        currentStreak: 770,
      }),
    )
    .$returningId();

  const noteContent = `${MARCA_ISO03M} nota del gimnasio dos ${suf}`;
  const [note] = await app.db
    .insert(schema.memberNotes)
    .values(
      tenantValues(CTX_DOS, {
        userId: socio.id,
        authorId: gym2.adminId,
        content: noteContent,
      }),
    )
    .$returningId();

  const [statusHistory] = await app.db
    .insert(schema.userStatusHistory)
    .values(
      tenantValues(CTX_DOS, {
        userId: socio.id,
        fromStatus: null,
        toStatus: "activo" as const,
        source: "admin",
      }),
    )
    .$returningId();

  const [login] = await app.db
    .insert(schema.memberLogins)
    .values(tenantValues(CTX_DOS, { userId: socio.id }))
    .$returningId();

  // Deuda: importe GRANDE a proposito — otro orden de magnitud que la de El
  // Templo (111). Si `totalDebtByCurrency` sumara la fila ajena, el total
  // dejaria de ser identificable como "solo lo propio".
  const debtAmount = 777777;
  const [balance] = await app.db
    .insert(schema.balances)
    .values(
      tenantValues(CTX_DOS, {
        memberId: socio.id,
        targetKind: "debt_balance" as const,
        targetId: 0,
        currency: "ARS",
        amount: debtAmount,
      }),
    )
    .$returningId();

  const sessionCount = 5;
  const hoy = todayStr();
  for (let i = 0; i < sessionCount; i++) {
    await app.db.insert(schema.completedSessions).values(
      tenantValues(CTX_DOS, {
        userId: socio.id,
        dayId: `W1-lunes-sigma-${i}`,
        sessionLevel: "sigma" as const,
        date: hoy,
        branchId: gym2.branchId,
        startedAt: new Date(),
        completedAt: new Date(),
        blocksCompleted: [],
      }),
    );
  }

  // Sede virtual "Templo Online" del gimnasio 2 (onboarding, doc 07 §1.4):
  // ninguna de las 9 rutas de este plan la ejercita, pero `second-tenant.ts`
  // nunca la siembra y `resolveUserBranchId` (coach-load-routes.ts) cae en
  // ella por NOMBRE en cuanto un socio del gimnasio 2 se quede sin sede.
  const [virtualBranch] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(CTX_DOS, {
        name: "Templo Online",
        code: `G2ONLINE${suf}`.slice(0, 20),
        country: "AR",
        isVirtual: true,
        isActive: true,
      }),
    )
    .$returningId();

  // Actor `owner` dedicado: `export-sepa` exige `scope.country === 'ES'`
  // para cualquier actor NO-owner (`members/routes.ts:377`), y el admin que
  // ya crea `seedSecondTenant` tiene su sede en AR (precondicion #1 de la
  // bateria). Un owner bypassea ese gate de pais sin tocar la precondicion.
  const ownerEmail = `owner-g2-${suf}@test.com`;
  const ownerPassword = "gym2-owner-123";
  const ownerId = await createStaffUser(app, {
    email: ownerEmail,
    password: ownerPassword,
    firstName: "Owner",
    lastName: "GimnasioDos",
    role: "owner",
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });
  let ownerToken: string;
  try {
    ownerToken = await getAuthToken(app, ownerEmail, ownerPassword);
  } catch (err: unknown) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sembrarSociosGimnasioDos: no se pudo autenticar al owner ${ownerEmail} (gimnasio ${TENANT_DOS}). ${detalle}`,
    );
  }

  const sepaBase = await sembrarFichaSepa(app, CTX_DOS, "Gdos");

  return {
    userId: socio.id,
    branchId: gym2.branchId,
    firstName,
    lastName,
    dni,
    phone,
    email,
    profileId: profile.id,
    noteId: note.id,
    noteAuthorId: gym2.adminId,
    noteContent,
    statusHistoryId: statusHistory.id,
    loginId: login.id,
    balanceId: balance.id,
    debtAmount,
    sessionLevel: "sigma",
    sessionCount,
    virtualBranchId: virtualBranch.id,
    sepa: { ...sepaBase, ownerToken, ownerId },
  };
}

// ─── Limpieza ────────────────────────────────────────────────────────────────

/**
 * Borra lo que este fixture deja en `branches` — la única tabla del archivo
 * que ningún `TABLES_TO_CLEAN` global vacía (ver "QUE LIMPIA QUIEN" arriba).
 *
 * Las de El Templo se filtran por MARCA (borrar de más ahí se llevaría
 * sedes reales que decenas de archivos del mismo worker dan por vivas). Las
 * del gimnasio 2 se incluyen también, defensivo: `limpiarSegundoGimnasio`
 * (llamado por `seedSecondTenant`) ya borra TODAS las branches de
 * `TENANT_DOS` sin condicion de nombre, así que este segundo DELETE es un
 * no-op en el camino feliz — pero corre ANTES que aquel (mismo orden que
 * `limpiarFinanzasDeLaBateria`), así que si algún día una tabla nueva de acá
 * pasa a depender de que la sede exista, esta función sigue siendo el punto
 * único de limpieza previo a `seedSecondTenant`.
 *
 * Conexión única + `FOREIGN_KEY_CHECKS=0` (mismo patrón que
 * `cleanAllTestData`): sin usuarios apuntando a estas sedes en este punto
 * del ciclo de vida (`cleanAllTestData` ya corrió), el orden entre los dos
 * DELETE no importa en la práctica, pero se preserva el patrón "El Templo
 * antes que el gimnasio 2" por legibilidad.
 */
export async function limpiarSociosDeLaBateria(
  app: FastifyInstance,
): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query(
      `DELETE FROM \`branches\` WHERE tenant_id = ? AND name LIKE ?`,
      [TENANT_TEMPLO, `${MARCA_ISO03M}%`],
    );
    await conn.query(`DELETE FROM \`branches\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}
