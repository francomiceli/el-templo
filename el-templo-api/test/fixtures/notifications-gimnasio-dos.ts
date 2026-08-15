/**
 * Fase 175.1 Plan 04 (ISO-03) — el segundo gimnasio (y su equivalente ajeno en
 * El Templo) para las 4 tablas de `notifications`, sembrable en una llamada.
 *
 * EL CASO CENTRAL: LA KEY COMPUESTA DE `notification_templates` (bug cerrado en 175-03)
 * -----------------------------------------------------------------------
 * `notification_templates` tiene un unique `(tenant_id, template_key)` desde
 * la migración 168 — cada gimnasio puede tener su PROPIA plantilla con la
 * MISMA key. Antes de 175-03, `GET/PUT /api/notifications/admin/templates*`
 * resolvía por `template_key` (o por PK cruda) sin `tenantWhere`, así que un
 * admin de un gimnasio podía leer/pisar la plantilla de OTRO con la misma key
 * (T-175-03-I / T-175-03-E). Este archivo siembra {@link TEMPLATE_KEY_COLISION}
 * en AMBOS tenants, con contenido (título/cuerpo) DISTINTO — el insumo directo
 * del caso que prueba que 175-03 lo cerró de verdad.
 *
 * LAS 4 TABLAS YA ESTÁN EN `TABLES_TO_CLEAN` (test/helpers.ts)
 * -----------------------------------------------------------------------
 * Igual que `campaigns-gimnasio-dos.ts`: `cleanAllTestData` ya vacía las 4
 * tablas de este archivo SIN filtro de tenant en cada `beforeEach`. Este
 * archivo expone {@link limpiarNotifDeLaBateria} de todos modos — idioma
 * esperado por el resto de la batería + defensivo, no la única línea de
 * defensa.
 *
 * PREFERENCIAS CON VALOR EXPLÍCITO DISTINTO DEL DEFAULT
 * -----------------------------------------------------------------------
 * `getUserPreferences` devuelve `true` para cualquier categoría sin fila
 * propia (default). Un valor `false` explícito en una tabla es la única
 * forma de distinguir "leyó mi fila" de "no filtró nada y cayó al default de
 * todos modos" — mismo criterio de "orden de magnitud distinto" que el resto
 * de la batería (`members-gimnasio-dos.ts`). El Templo y el gimnasio 2 usan
 * categorías DISTINTAS (`planes` / `entrenamiento`) para poder afirmar en la
 * misma llamada "lo mío cambió, lo del otro sigue en default".
 *
 * @see test/fixtures/campaigns-gimnasio-dos.ts — el molde inmediato (175.1-03)
 * @see test/fixtures/members-gimnasio-dos.ts — el molde original (173-26)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-07, D-11
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createStaffUser, createTestMember, getAuthToken } from "../helpers";
import { TENANT_DOS, TENANT_TEMPLO, type SegundoGimnasio } from "./second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Contexto de escritura del gimnasio 2. */
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Contexto de escritura de El Templo. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

/** Prefijo grepeable de todo título/cuerpo que este archivo siembra. */
export const MARCA_ISO03N = "ISO03N";

/**
 * `template_key` sembrada en AMBOS tenants con contenido distinto — el
 * insumo del caso de la key compuesta (ver docblock del archivo). NO
 * pertenece a `TEMPLATE_SEEDS` (types.ts): una key propia evita cualquier
 * colisión con el catálogo real que siembra `POST /admin/seed-templates`.
 */
export const TEMPLATE_KEY_COLISION = "iso03n-colision-key";

/** Sufijo único por corrida, mismo generador que el resto de la batería. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Forma de los handles ────────────────────────────────────────────────────

interface FichaNotifComun {
  branchId: number;
  memberId: number;
  memberToken: string;
  memberEmail: string;
  /** La fila de `notification_templates` con key {@link TEMPLATE_KEY_COLISION}. */
  templateId: number;
  templateTitle: string;
  templateBody: string;
  deviceTokenId: number;
  deviceToken: string;
  /** La fila EXPLÍCITA de `notification_preferences` (ver docblock del archivo). */
  preferenceId: number;
  preferenceCategory: "planes" | "entrenamiento";
  /** `pending_notifications` con `templateId` apuntando a la plantilla propia. */
  pendingId: number;
}

/** El recurso ajeno: la ficha completa de notifications de El Templo. */
export interface FichaNotifTemplo extends FichaNotifComun {
  preferenceCategory: "planes";
}

/** Lo propio: la ficha completa de notifications del gimnasio 2. */
export interface FichaNotifGimnasioDos extends FichaNotifComun {
  preferenceCategory: "entrenamiento";
  /** Actor `owner` dedicado — `POST /admin/seed-templates` exige `OWNER_ROLES`. */
  ownerId: number;
  ownerToken: string;
}

// ─── Evidencia leída de la BASE ──────────────────────────────────────────────

/** Una fila de `notification_templates`, releída de la base por id. */
export interface PlantillaLeida {
  id: number;
  tenantId: number;
  templateKey: string;
  title: string;
  body: string;
  openedCount: number;
  sentCount: number;
}

/**
 * Relee una plantilla por id. ESTA ES LA EVIDENCIA QUE VALE en el caso de la
 * key compuesta: el `tenant_id`/`title`/`body` reales de la fila, nunca lo
 * que la ruta devuelve (que podría estar filtrando "gratis" en el front). La
 * exención `tenant-safe` va embebida en el SQL (único canal que el sentinel
 * lee) — mismo idioma que `tenantDeLaFilaCampaign`.
 */
export async function plantillaPorId(
  app: FastifyInstance,
  id: number,
): Promise<PlantillaLeida | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer la plantilla (ajena o propia) por id ES la asercion del caso de la key compuesta; filtrarla por tenant la volveria tautologica */ id, tenant_id AS tenantId, template_key AS templateKey, title, body, opened_count AS openedCount, sent_count AS sentCount FROM notification_templates WHERE id = ${id}`,
  )) as unknown as [Array<PlantillaLeida>];
  return resultado[0]?.[0] ?? null;
}

/**
 * Busca la plantilla de UN tenant dado por su `template_key`. Usada por el
 * caso de `POST /admin/seed-templates`: confirma que sembrar el catálogo
 * para el gimnasio 2 no se salta una key ya tomada por El Templo (el bug
 * exacto que 175-03 cerró — antes `INSERT IGNORE` chocaba contra una unique
 * global y el segundo gimnasio se quedaba SIN esa plantilla).
 */
export async function filaTemplatePorTenantYKey(
  app: FastifyInstance,
  tenantId: number,
  templateKey: string,
): Promise<{ id: number; title: string } | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer por (tenant_id, template_key) ES la asercion del caso seed-templates; es la unica forma de confirmar que el catalogo del gimnasio 2 no se salteo por una key ya tomada por El Templo */ id, title FROM notification_templates WHERE tenant_id = ${tenantId} AND template_key = ${templateKey} LIMIT 1`,
  )) as unknown as [Array<{ id: number; title: string }>];
  return resultado[0]?.[0] ?? null;
}

/**
 * El `tenant_id` REAL de un `device_tokens` por su `token` (UNIQUE global,
 * M8 — ver `src/db/schema/notifications.ts`). Usado por el caso de
 * `POST /token`: la fila estampa el tenant DERIVADO del usuario dueño
 * (`resolveUserTenant`, `service.ts`), no del `ctx` de la request (no hay
 * uno — la ruta es de miembro autenticado, sin `attachCountryScope`).
 */
export async function tenantDelTokenDispositivo(
  app: FastifyInstance,
  token: string,
): Promise<number | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer por token (UNIQUE global, M8) ES la asercion de POST /token; no hay ambiguedad posible */ tenant_id AS t FROM device_tokens WHERE token = ${token} LIMIT 1`,
  )) as unknown as [Array<{ t: number | null }>];
  const fila = resultado[0]?.[0];
  return fila === undefined || fila.t === null ? null : Number(fila.t);
}

/**
 * La fila de `notification_preferences` de un usuario para una categoría,
 * releída de la base. Usada por el caso de `PUT /preferences`.
 */
export async function preferenciaPorUsuarioYCategoria(
  app: FastifyInstance,
  userId: number,
  category: string,
): Promise<{ id: number; tenantId: number; enabled: boolean } | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer por (user_id, notification_category) ES la asercion de PUT /preferences — el userId identifica la fila propia del actor autenticado, sin ambiguedad */ id, tenant_id AS tenantId, enabled FROM notification_preferences WHERE user_id = ${userId} AND notification_category = ${category} LIMIT 1`,
  )) as unknown as [Array<{ id: number; tenantId: number; enabled: number | boolean }>];
  const fila = resultado[0]?.[0];
  if (fila === undefined) return null;
  return { id: fila.id, tenantId: fila.tenantId, enabled: Boolean(fila.enabled) };
}

/**
 * La fila MÁS NUEVA de `pending_notifications` para un `userId`, releída de
 * la base. Usada por el caso de `POST /admin/send-segment`: la ruta solo
 * devuelve un `queued: number` agregado, no los ids que escribió.
 */
export async function ultimaPendingDeUsuario(
  app: FastifyInstance,
  userId: number,
): Promise<{ id: number; tenantId: number } | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer la fila mas nueva escrita por send-segment para este userId ES la asercion — la ruta no devuelve el id que escribio */ id, tenant_id AS tenantId FROM pending_notifications WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  )) as unknown as [Array<{ id: number; tenantId: number }>];
  return resultado[0]?.[0] ?? null;
}

// ─── Siembra: El Templo (recurso ajeno) ─────────────────────────────────────

/**
 * Siembra la ficha completa de notifications de El Templo: el recurso AJENO
 * que el staff del gimnasio 2 no tiene que poder listar, editar ni cuya
 * audiencia puede alcanzar.
 */
export async function sembrarNotifTemplo(
  app: FastifyInstance,
): Promise<FichaNotifTemplo> {
  const suf = sufijo();

  const [sede] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, CTX_TEMPLO))
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      "sembrarNotifTemplo: El Templo no tiene ninguna sede. La siembra " +
        "test/setup.ts — revisar ese archivo.",
    );
  }

  const member = await createTestMember(app, {
    email: `notif-templo-${suf}@test.com`,
    branchId: sede.id,
  });

  // Segmento 'optima', propio: audiencia de POST /admin/send-segment.
  await app.db.insert(schema.memberProfiles).values(
    tenantValues(CTX_TEMPLO, {
      userId: member.id,
      segment: "optima" as const,
    }),
  );

  const templateTitle = `${MARCA_ISO03N} Plantilla Templo ${suf}`;
  const templateBody = `${MARCA_ISO03N} Cuerpo Templo ${suf}`;
  const [template] = await app.db
    .insert(schema.notificationTemplates)
    .values(
      tenantValues(CTX_TEMPLO, {
        templateKey: TEMPLATE_KEY_COLISION,
        category: "anuncios" as const,
        title: templateTitle,
        body: templateBody,
        route: "/mi-templo",
        isEnabled: true,
      }),
    )
    .$returningId();

  const deviceToken = `${MARCA_ISO03N}-token-templo-${suf}`;
  const [device] = await app.db
    .insert(schema.deviceTokens)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        token: deviceToken,
        platform: "android" as const,
      }),
    )
    .$returningId();

  // Preferencia EXPLICITA (ver docblock del archivo): categoria 'planes',
  // distinta de la del gimnasio 2 ('entrenamiento'), en `false` (default es
  // `true` para toda fila ausente).
  const [preference] = await app.db
    .insert(schema.notificationPreferences)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        category: "planes" as const,
        enabled: false,
      }),
    )
    .$returningId();

  const [pending] = await app.db
    .insert(schema.pendingNotifications)
    .values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        templateId: template.id,
        title: templateTitle,
        body: templateBody,
        route: "/mi-templo",
        status: "pending" as const,
        scheduledAt: new Date(),
      }),
    )
    .$returningId();

  return {
    branchId: sede.id,
    memberId: member.id,
    memberToken: member.token,
    memberEmail: member.email,
    templateId: template.id,
    templateTitle,
    templateBody,
    deviceTokenId: device.id,
    deviceToken,
    preferenceId: preference.id,
    preferenceCategory: "planes",
    pendingId: pending.id,
  };
}

// ─── Siembra: gimnasio 2 (lo propio) ────────────────────────────────────────

/**
 * Siembra la ficha completa de notifications del gimnasio 2, más un actor
 * `owner` dedicado (`POST /admin/seed-templates` exige `OWNER_ROLES`, y
 * `seedSecondTenant` solo deja admin/coach).
 *
 * Va SIEMPRE después de `seedSecondTenant` (necesita `gym2.branchId`).
 */
export async function sembrarNotifGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<FichaNotifGimnasioDos> {
  const suf = sufijo();

  const ownerEmail = `owner-notif-g2-${suf}@test.com`;
  const ownerPassword = "gym2-notif-owner-123";
  const ownerId = await createStaffUser(app, {
    email: ownerEmail,
    password: ownerPassword,
    firstName: "Owner",
    lastName: "NotifGdos",
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
      `sembrarNotifGimnasioDos: no se pudo autenticar al owner ${ownerEmail} (gimnasio ${TENANT_DOS}). ${detalle}`,
    );
  }

  const member = await createTestMember(app, {
    email: `notif-g2-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });

  await app.db.insert(schema.memberProfiles).values(
    tenantValues(CTX_DOS, {
      userId: member.id,
      segment: "optima" as const,
    }),
  );

  const templateTitle = `${MARCA_ISO03N} Plantilla Gdos ${suf}`;
  const templateBody = `${MARCA_ISO03N} Cuerpo Gdos ${suf}`;
  const [template] = await app.db
    .insert(schema.notificationTemplates)
    .values(
      tenantValues(CTX_DOS, {
        templateKey: TEMPLATE_KEY_COLISION,
        category: "anuncios" as const,
        title: templateTitle,
        body: templateBody,
        route: "/mi-templo",
        isEnabled: true,
      }),
    )
    .$returningId();

  const deviceToken = `${MARCA_ISO03N}-token-gdos-${suf}`;
  const [device] = await app.db
    .insert(schema.deviceTokens)
    .values(
      tenantValues(CTX_DOS, {
        userId: member.id,
        token: deviceToken,
        platform: "ios" as const,
      }),
    )
    .$returningId();

  // Preferencia EXPLICITA: categoria 'entrenamiento' (distinta de la de El
  // Templo), en `false`.
  const [preference] = await app.db
    .insert(schema.notificationPreferences)
    .values(
      tenantValues(CTX_DOS, {
        userId: member.id,
        category: "entrenamiento" as const,
        enabled: false,
      }),
    )
    .$returningId();

  const [pending] = await app.db
    .insert(schema.pendingNotifications)
    .values(
      tenantValues(CTX_DOS, {
        userId: member.id,
        templateId: template.id,
        title: templateTitle,
        body: templateBody,
        route: "/mi-templo",
        status: "pending" as const,
        scheduledAt: new Date(),
      }),
    )
    .$returningId();

  return {
    branchId: gym2.branchId,
    memberId: member.id,
    memberToken: member.token,
    memberEmail: member.email,
    templateId: template.id,
    templateTitle,
    templateBody,
    deviceTokenId: device.id,
    deviceToken,
    preferenceId: preference.id,
    preferenceCategory: "entrenamiento",
    pendingId: pending.id,
    ownerId,
    ownerToken,
  };
}

// ─── Limpieza ────────────────────────────────────────────────────────────────

/**
 * Borra el rastro de las 4 tablas de este archivo en TENANT_DOS, en orden
 * FK-seguro (`pending_notifications` referencia `notification_templates` vía
 * `template_id` → primero; `device_tokens`/`notification_preferences` solo
 * referencian `users`, sin orden entre sí; `notification_templates` último).
 * Las 4 tablas YA están en `TABLES_TO_CLEAN` (ver el docblock del archivo) —
 * este DELETE es defensivo/idiomático, no la única línea de defensa. Los
 * usuarios que este archivo crea (`ownerId`, `memberId`) los limpia
 * `cleanAllTestData`.
 */
export async function limpiarNotifDeLaBateria(
  app: FastifyInstance,
): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query(
      `DELETE FROM \`pending_notifications\` WHERE tenant_id = ?`,
      [TENANT_DOS],
    );
    await conn.query(
      `DELETE FROM \`notification_preferences\` WHERE tenant_id = ?`,
      [TENANT_DOS],
    );
    await conn.query(`DELETE FROM \`device_tokens\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(
      `DELETE FROM \`notification_templates\` WHERE tenant_id = ?`,
      [TENANT_DOS],
    );
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}
