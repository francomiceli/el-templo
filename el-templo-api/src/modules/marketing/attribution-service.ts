// Módulo: marketing — guardado de la atribución de un alta (fase 195, plan 07).
//
// `recordSignupAttribution` escribe UNA fila por usuario en
// `signup_attributions` (UNIQUE por tenant: el primer origen gana, un segundo
// intento no lo pisa). `recordSignupAttributionBestEffort` es la que usan las
// rutas: nunca lanza, un error al guardar el origen NUNCA bloquea el alta
// (T-195-25) — mismo criterio que los bloques de referidos/partner del
// registro.
//
// Todo lo que viene del cliente se vuelve a validar acá (la ruta ya validó
// largo con el schema): se sacan caracteres de control y se descarta lo que no
// cumple el charset esperado (ids de click, fbp, host, ruta) en vez de
// rechazar el alta. La IP solo se guarda si `net.isIP` la acepta.
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { IncomingHttpHeaders } from "node:http";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { signupAttributions } from "../../db/schema/signup-attributions";
import { tenantValues, type TenantContext } from "../shared/tenant";
import { classifyChannel, type ManualOrigin } from "./channel";

type DbInstance = MySql2Database<typeof schema>;

/** Lo que manda el cliente en `attribution` (ver `signupAttributionBodySchema`). */
export interface SignupAttributionBody {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  src_ref?: string;
  landing?: string;
  fbp?: string;
  ft?: string;
  platform?: "web" | "android" | "ios";
}

export type AttributionPlatform =
  | "web"
  | "android"
  | "ios"
  | "admin"
  | "unknown";

export interface RecordSignupAttributionInput {
  userId: number;
  branchId: number | null;
  capturedVia: "register" | "admin_trial";
  platform: AttributionPlatform;
  body?: SignupAttributionBody;
  promoCode?: string;
  refCode?: string;
  manualOrigin?: ManualOrigin;
  manualCampaign?: string;
  clientIp?: string | string[];
  userAgent?: string;
}

// Largos de columna (src/db/schema/signup-attributions.ts).
const MAX = {
  utm: 150,
  promo: 50,
  ref: 32,
  host: 255,
  landing: 500,
  fbclid: 255,
  fbc: 300,
  fbp: 100,
  gclid: 255,
  ip: 45,
  userAgent: 512,
} as const;

// Click ids de Meta/Google y `_fbp`: solo estos caracteres. Alimentan a CAPI,
// así que un valor raro se descarta en vez de mandarse.
const ID_RE = /^[A-Za-z0-9._-]+$/;
const HOST_RE = /^[a-z0-9.-]+$/;
// Ventana razonable para un timestamp de first-touch.
const FIRST_TOUCH_MIN_MS = Date.UTC(2020, 0, 1);
const FIRST_TOUCH_MAX_SKEW_MS = 24 * 60 * 60 * 1000;

/** Trim + sin caracteres de control + truncado; vacío -> null. */
function text(value: string | undefined | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned === "") return null;
  return cleaned.slice(0, max);
}

function id(value: string | undefined, max: number): string | null {
  const t = text(value, max);
  return t !== null && ID_RE.test(t) ? t : null;
}

function host(value: string | undefined): string | null {
  const t = text(value, MAX.host)?.toLowerCase() ?? null;
  return t !== null && HOST_RE.test(t) ? t : null;
}

function landingPath(value: string | undefined): string | null {
  const t = text(value, MAX.landing);
  return t !== null && t.startsWith("/") ? t : null;
}

function firstTouchMs(value: string | undefined, now: number): number | null {
  if (typeof value !== "string" || !/^[0-9]{1,15}$/.test(value)) return null;
  const ms = Number(value);
  if (ms < FIRST_TOUCH_MIN_MS || ms > now + FIRST_TOUCH_MAX_SKEW_MS) {
    return null;
  }
  return ms;
}

function validIp(value: string | string[] | undefined): string | null {
  // Node une los headers repetidos con ", " (no los entrega como array) y esa
  // lista no pasa `isIP`: cualquier cosa que no sea un string es NULL.
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isIP(trimmed) !== 0 ? trimmed.slice(0, MAX.ip) : null;
}

export async function recordSignupAttribution(
  db: DbInstance,
  ctx: TenantContext,
  input: RecordSignupAttributionInput,
): Promise<void> {
  const body = input.body ?? {};
  const now = Date.now();

  const utmSource = text(body.utm_source, MAX.utm);
  const utmMedium = text(body.utm_medium, MAX.utm);
  // En el alta del admin la "campaña" opcional ocupa el lugar de utm_campaign.
  const utmCampaign = text(body.utm_campaign ?? input.manualCampaign, MAX.utm);
  const utmContent = text(body.utm_content, MAX.utm);
  const utmTerm = text(body.utm_term, MAX.utm);
  const promoCode = text(input.promoCode, MAX.promo);
  const refCode = text(input.refCode, MAX.ref);
  const referrerHost = host(body.src_ref);
  const fbclid = id(body.fbclid, MAX.fbclid);
  const gclid = id(body.gclid, MAX.gclid);
  const fbp = id(body.fbp, MAX.fbp);
  const ftMs = firstTouchMs(body.ft, now);
  const fbc = fbclid !== null ? `fb.1.${ftMs ?? now}.${fbclid}` : null;

  const channel = classifyChannel({
    utmSource,
    utmMedium,
    utmCampaign,
    referrerHost,
    fbclid,
    gclid,
    refCode,
    promoCode,
    manualOrigin: input.manualOrigin,
  });

  await db
    .insert(signupAttributions)
    .values(
      tenantValues(ctx, {
        userId: input.userId,
        branchId: input.branchId,
        channel,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        promoCode,
        refCode,
        manualOrigin: input.manualOrigin ?? null,
        referrerHost,
        landingPath: landingPath(body.landing),
        fbclid,
        fbc,
        fbp,
        gclid,
        platform: input.platform,
        capturedVia: input.capturedVia,
        firstTouchAt: ftMs !== null ? new Date(ftMs) : null,
        clientIp: validIp(input.clientIp),
        userAgent: text(input.userAgent, MAX.userAgent),
      }),
    )
    // Ya hay una fila de este usuario: la primera atribución gana, no se pisa.
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
}

/** Igual que `recordSignupAttribution` pero NUNCA lanza (graceful degradation). */
export async function recordSignupAttributionBestEffort(
  db: DbInstance,
  log: FastifyBaseLogger,
  ctx: TenantContext,
  input: RecordSignupAttributionInput,
): Promise<void> {
  try {
    await recordSignupAttribution(db, ctx, input);
  } catch (err: unknown) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        userId: input.userId,
      },
      "Signup attribution failed (graceful degradation)",
    );
  }
}

/** Lo mínimo que `recordRegisterAttribution` lee del request de `/register`. */
export interface RegisterAttributionRequest {
  log: FastifyBaseLogger;
  headers: IncomingHttpHeaders;
  body: { attribution?: SignupAttributionBody };
}

/**
 * Gancho de `POST /api/auth/register`: arma el input desde el request (plataforma
 * declarada por el cliente, IP real detrás de nginx, user agent) y guarda el
 * origen en modo best-effort. Vive acá y no en la ruta para que el cambio en
 * `auth/routes.ts` quede en un par de líneas. Un cliente viejo sin
 * `attribution` queda con plataforma 'unknown' (CAPI la excluye, 195-08).
 */
export async function recordRegisterAttribution(
  db: DbInstance,
  request: RegisterAttributionRequest,
  ctx: TenantContext,
  alta: {
    userId: number;
    branchId: number;
    promoCode?: string;
    refCode?: string;
  },
): Promise<void> {
  const body = request.body.attribution;
  await recordSignupAttributionBestEffort(db, request.log, ctx, {
    ...alta,
    capturedVia: "register",
    platform: body?.platform ?? "unknown",
    body,
    // La API no tiene trustProxy: la IP real llega en x-real-ip (nginx).
    clientIp: request.headers["x-real-ip"],
    userAgent: request.headers["user-agent"],
  });
}
