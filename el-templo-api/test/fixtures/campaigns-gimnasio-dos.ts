/**
 * Fase 175.1 Plan 03 (ISO-03) — el segundo gimnasio (y su equivalente ajeno en
 * El Templo) para las 4 tablas de `campaigns`, sembrable en una llamada.
 *
 * POR QUE ESTE ARCHIVO ES DISTINTO DEL RESTO DE LA BATERÍA ISO-03
 * -----------------------------------------------------------------------
 * A diferencia de `analytics` (175.1-02, sin tablas propias), `campaigns` SÍ
 * tiene 4 tablas gym-owned (`campaigns`, `campaign_sends`, `campaign_events`,
 * `campaign_unsubscribes`) — el riesgo real acá es un `tenantWhere` perdido en
 * un método puntual del módulo, exactamente el idioma del resto de la batería
 * (members/finance/subs-sched).
 *
 * LAS 4 TABLAS YA ESTÁN EN `TABLES_TO_CLEAN` (test/helpers.ts) — A DIFERENCIA
 * DE `branches`/`schedules`/`subscription_plans`
 * -----------------------------------------------------------------------
 * `cleanAllTestData` ya vacía las 4 tablas de este archivo SIN filtro de
 * tenant en cada `beforeEach` (a diferencia de `branches`, que sobrevive entre
 * archivos del mismo worker — de ahí que `second-tenant.ts`/
 * `members-gimnasio-dos.ts` necesiten su propia limpieza local). Este archivo
 * expone {@link limpiarCampaignsDeLaBateria} de todos modos, por 2 motivos:
 * (a) es el idioma esperado por el resto de la batería (D-09 del CONTEXT de
 * la fase: "arreglar el fallout de fixtures inline"), y (b) defensivo — si el
 * día de mañana un archivo compone esta siembra SIN pasar por
 * `cleanAllTestData` en cada test, sigue siendo seguro de invocar sola.
 *
 * EL TOKEN DEL SEND ES EL INSUMO DE LA MINA M3 (175-02)
 * -----------------------------------------------------------------------
 * `sembrarCampaignsGimnasioDos` firma el `sendToken` con `signCampaignToken`
 * (el MISMO firmante que usa `CampaignService.send` en producción) para el
 * `sendId` recién sembrado — así el caso de las rutas públicas por token
 * (`GET /api/campaigns/track/{open,click}`, `GET /api/campaigns/unsubscribe`)
 * usa un token indistinguible de uno real, y la batería prueba la resolución
 * de tenant vía `campaign_sends` (T-175-02), no un atajo de test.
 *
 * VALORES IRREPETIBLES Y RECURSO AJENO
 * -----------------------------------------------------------------------
 * `sembrarCampanaTemplo` es el gemelo del gimnasio 2 para El Templo (mismo
 * criterio que `sembrarSocioTemplo` en `members-gimnasio-dos.ts`): sin él, el
 * caso "aislamiento" de `GET /admin` (listar campañas) no tendría ninguna
 * campaña ajena real que EXCLUIR — pasaría en verde por falta de dato, no por
 * aislamiento genuino. `MARCA_ISO03C` marca el nombre de toda campaña que este
 * archivo siembra, para poder filtrar por texto en las aserciones de lista.
 *
 * @see test/fixtures/members-gimnasio-dos.ts — el molde (docblock + idioma)
 * @see test/fixtures/second-tenant.ts — `seedSecondTenant`, `TENANT_DOS`
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01..D-11
 */
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { signCampaignToken } from "../../src/modules/campaigns/token-service";
import {
  createStaffUser,
  createTestMember,
  createEligibleFreemium,
  getAuthToken,
} from "../helpers";
import { TENANT_DOS, TENANT_TEMPLO, type SegundoGimnasio } from "./second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Contexto de escritura del gimnasio 2. */
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Contexto de escritura de El Templo. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

/** Prefijo grepeable de toda fila (`campaigns.name`) que este archivo siembra. */
export const MARCA_ISO03C = "ISO03C";

const EMAIL_ADMIN_SEMILLA = "admin@test.com";

/** Sufijo único por corrida, mismo generador que el resto de la batería. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

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
      `campaigns-gimnasio-dos: no existe ${EMAIL_ADMIN_SEMILLA}. Lo siembra ` +
        `test/setup.ts y es el único usuario que sobrevive a cleanAllTestData: ` +
        `sin él no hay creador válido para la campaña de El Templo.`,
    );
  }
  return fila.id;
}

// ─── Forma de los handles ────────────────────────────────────────────────────

interface FichaCampaignsComun {
  campaignId: number;
  campaignName: string;
  sendId: number;
  sendUserId: number;
  sendEmail: string;
  /** Token HMAC válido (mismo firmante que producción) que identifica `sendId`. */
  sendToken: string;
  eventId: number;
  unsubscribeId: number;
  unsubscribeEmail: string;
  freemiumUserId: number;
  freemiumEmail: string;
}

/** El recurso ajeno: la campaña completa de El Templo. */
export interface FichaCampanaTemplo extends FichaCampaignsComun {
  branchId: number;
}

/** Lo propio: la campaña completa del gimnasio 2. */
export interface FichaCampaignsGimnasioDos extends FichaCampaignsComun {
  /** Actor `owner` dedicado — `POST /admin/:id/send` exige `OWNER_ROLES`. */
  ownerId: number;
  ownerToken: string;
}

// ─── Evidencia leída de la BASE ──────────────────────────────────────────────

/** Las 4 tablas gym-owned de este módulo. Unión CERRADA (mismo motivo que `TablaDelModulo`). */
export type TablaCampaigns =
  | "campaigns"
  | "campaign_sends"
  | "campaign_events"
  | "campaign_unsubscribes";

/**
 * El `tenant_id` REAL de una fila, leído de la base por id. ESTA ES LA ÚNICA
 * EVIDENCIA QUE VALE en la batería ISO-03 (mismo idioma que `tenantDeLaFila`
 * en `members-gimnasio-dos.ts`): la exención `tenant-safe` va embebida en el
 * SQL, no en un comentario TS (el sentinel/lint solo leen el SQL final).
 */
export async function tenantDeLaFilaCampaign(
  app: FastifyInstance,
  tabla: TablaCampaigns,
  id: number,
): Promise<number | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: leer el tenant_id de la fila ES la asercion; filtrar por el la volveria tautologica */ tenant_id AS t FROM ${sql.raw(tabla)} WHERE id = ${id}`,
  )) as unknown as [Array<{ t: number | null }>];
  const filas = resultado[0] ?? [];
  if (filas[0] === undefined || filas[0].t === null) return null;
  return Number(filas[0].t);
}

/**
 * El id + tenant_id de la fila MÁS NUEVA de `campaign_events` para un
 * `sendId`+`type` dado, leído de la base. Usado por el caso de las rutas
 * públicas por token (`track/open`, `track/click`): la ruta no devuelve el id
 * de la fila que escribe (un GIF / un 302), así que hay que releerla.
 */
export async function ultimoEventoDeLaFila(
  app: FastifyInstance,
  sendId: number,
  type: "open" | "click",
): Promise<{ id: number; tenantId: number } | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer el evento mas nuevo escrito por la ruta publica ES la asercion (T-175-02) */ id, tenant_id AS tenantId FROM campaign_events WHERE send_id = ${sendId} AND type = ${type} ORDER BY id DESC LIMIT 1`,
  )) as unknown as [Array<{ id: number; tenantId: number }>];
  const filas = resultado[0] ?? [];
  return filas[0] ?? null;
}

/**
 * La fila de `campaign_unsubscribes` por email, leída de la base. Usado por
 * el caso M3 (`GET /unsubscribe`): la ruta no devuelve el id de la fila que
 * escribe (siempre la misma página HTML genérica, D-15 anti-enumeración).
 */
export async function unsubscribePorEmail(
  app: FastifyInstance,
  email: string,
): Promise<{ id: number; tenantId: number } | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer la fila de baja escrita por la ruta publica ES la asercion (T-175-02, mina M3) */ id, tenant_id AS tenantId FROM campaign_unsubscribes WHERE email = ${email} ORDER BY id DESC LIMIT 1`,
  )) as unknown as [Array<{ id: number; tenantId: number }>];
  const filas = resultado[0] ?? [];
  return filas[0] ?? null;
}

// ─── Siembra: El Templo (recurso ajeno) ─────────────────────────────────────

/**
 * Siembra la campaña completa de El Templo: el recurso AJENO que el staff del
 * gimnasio 2 no tiene que poder listar, enviar, ni cuyo funnel/tracking puede
 * tocar.
 */
export async function sembrarCampanaTemplo(
  app: FastifyInstance,
): Promise<FichaCampanaTemplo> {
  const suf = sufijo();
  const authorId = await adminSemillaId(app);

  const [sede] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, CTX_TEMPLO))
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      "sembrarCampanaTemplo: El Templo no tiene ninguna sede. La siembra " +
        "test/setup.ts — revisar ese archivo.",
    );
  }

  const recipient = await createTestMember(app, {
    email: `camp-recipient-templo-${suf}@test.com`,
    branchId: sede.id,
  });

  const campaignName = `${MARCA_ISO03C} Campaña Templo ${suf}`;
  const [campaign] = await app.db
    .insert(schema.campaigns)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: campaignName,
        subject: `Asunto Templo ${suf}`,
        status: "draft",
        createdBy: authorId,
        country: null,
        headline: "Titular Templo",
        subheadline: "Subtítulo Templo",
        body: "Cuerpo Templo",
      }),
    )
    .$returningId();

  const [send] = await app.db
    .insert(schema.campaignSends)
    .values(
      tenantValues(CTX_TEMPLO, {
        campaignId: campaign.id,
        userId: recipient.id,
        email: recipient.email,
        status: "sent",
        sentAt: new Date(),
      }),
    )
    .$returningId();

  const sendToken = signCampaignToken({
    userId: recipient.id,
    campaignId: campaign.id,
    sendId: send.id,
  });

  const [event] = await app.db
    .insert(schema.campaignEvents)
    .values(tenantValues(CTX_TEMPLO, { sendId: send.id, type: "open" }))
    .$returningId();

  const unsubscribeEmail = `unsub-templo-${suf}@test.com`;
  const [unsub] = await app.db
    .insert(schema.campaignUnsubscribes)
    .values(
      tenantValues(CTX_TEMPLO, {
        email: unsubscribeEmail,
        userId: null,
        campaignId: campaign.id,
      }),
    )
    .$returningId();

  const freemium = await createEligibleFreemium(app, {
    email: `camp-freemium-templo-${suf}@test.com`,
    branchId: sede.id,
  });

  return {
    branchId: sede.id,
    campaignId: campaign.id,
    campaignName,
    sendId: send.id,
    sendUserId: recipient.id,
    sendEmail: recipient.email,
    sendToken,
    eventId: event.id,
    unsubscribeId: unsub.id,
    unsubscribeEmail,
    freemiumUserId: freemium.id,
    freemiumEmail: freemium.email,
  };
}

// ─── Siembra: gimnasio 2 (lo propio) ────────────────────────────────────────

/**
 * Siembra la campaña completa del gimnasio 2: 1 campaña + 1 send (a
 * `gym2.socios[0]`) + 1 evento + 1 baja, más un actor `owner` dedicado
 * (`POST /admin/:id/send` exige `OWNER_ROLES`, y `seedSecondTenant` solo deja
 * admin/coach) y un socio freemium elegible propio (para `eligible-count`).
 *
 * Va SIEMPRE después de `seedSecondTenant` (necesita `gym2.branchId` y
 * `gym2.socios[0]`).
 */
export async function sembrarCampaignsGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<FichaCampaignsGimnasioDos> {
  const suf = sufijo();

  const ownerEmail = `owner-camp-g2-${suf}@test.com`;
  const ownerPassword = "gym2-camp-owner-123";
  const ownerId = await createStaffUser(app, {
    email: ownerEmail,
    password: ownerPassword,
    firstName: "Owner",
    lastName: "CampaignsGdos",
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
      `sembrarCampaignsGimnasioDos: no se pudo autenticar al owner ${ownerEmail} (gimnasio ${TENANT_DOS}). ${detalle}`,
    );
  }

  const recipient = gym2.socios[0];

  const campaignName = `${MARCA_ISO03C} Campaña Gdos ${suf}`;
  const [campaign] = await app.db
    .insert(schema.campaigns)
    .values(
      tenantValues(CTX_DOS, {
        name: campaignName,
        subject: `Asunto Gdos ${suf}`,
        status: "draft",
        createdBy: ownerId,
        country: null,
        headline: "Titular Gdos",
        subheadline: "Subtítulo Gdos",
        body: "Cuerpo Gdos",
      }),
    )
    .$returningId();

  const [send] = await app.db
    .insert(schema.campaignSends)
    .values(
      tenantValues(CTX_DOS, {
        campaignId: campaign.id,
        userId: recipient.id,
        email: recipient.email,
        status: "sent",
        sentAt: new Date(),
      }),
    )
    .$returningId();

  const sendToken = signCampaignToken({
    userId: recipient.id,
    campaignId: campaign.id,
    sendId: send.id,
  });

  const [event] = await app.db
    .insert(schema.campaignEvents)
    .values(tenantValues(CTX_DOS, { sendId: send.id, type: "open" }))
    .$returningId();

  const unsubscribeEmail = `unsub-g2-${suf}@test.com`;
  const [unsub] = await app.db
    .insert(schema.campaignUnsubscribes)
    .values(
      tenantValues(CTX_DOS, {
        email: unsubscribeEmail,
        userId: null,
        campaignId: campaign.id,
      }),
    )
    .$returningId();

  const freemium = await createEligibleFreemium(app, {
    email: `camp-freemium-g2-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });

  return {
    ownerId,
    ownerToken,
    campaignId: campaign.id,
    campaignName,
    sendId: send.id,
    sendUserId: recipient.id,
    sendEmail: recipient.email,
    sendToken,
    eventId: event.id,
    unsubscribeId: unsub.id,
    unsubscribeEmail,
    freemiumUserId: freemium.id,
    freemiumEmail: freemium.email,
  };
}

// ─── Limpieza ────────────────────────────────────────────────────────────────

/**
 * Borra el rastro de las 4 tablas de este archivo en TENANT_DOS, en orden
 * FK-seguro (events/unsubscribes → sends → campaigns). Las 4 tablas YA están
 * en `TABLES_TO_CLEAN` (ver el docblock del archivo) — este DELETE es
 * defensivo/idiomático, no la única línea de defensa. Los usuarios que este
 * archivo crea (`ownerId`, `recipient`, `freemiumUserId`) los limpia
 * `cleanAllTestData` (DELETE FROM users WHERE email <> admin@test.com), así
 * que no hace falta borrarlos acá.
 */
export async function limpiarCampaignsDeLaBateria(
  app: FastifyInstance,
): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query(`DELETE FROM \`campaign_events\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(
      `DELETE FROM \`campaign_unsubscribes\` WHERE tenant_id = ?`,
      [TENANT_DOS],
    );
    await conn.query(`DELETE FROM \`campaign_sends\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query(`DELETE FROM \`campaigns\` WHERE tenant_id = ?`, [
      TENANT_DOS,
    ]);
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}
