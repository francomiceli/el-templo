// Módulo: communications — catálogo de avisos de sistema + seed idempotente
// (Fase 193, D-08/D-09/D-10/D-15/D-22)
//
// QUÉ ES
// ------
// Los pop-ups de calificación de clase, propuesta de mejora y vencimiento de
// plan, y las 4 tarjetas fijas del carrusel de Mi Templo, HOY tienen su copy
// hardcodeado en cada componente de `el-templo-app`
// (`RatingPromptDialog.vue`, `ImprovementPromptDialog.vue`,
// `PlanExpiryDialog.vue`, `ImprovementCtaCard.vue`, `ReferralCtaCard.vue`,
// `UpsellBadge.vue`, `ProgramCtaCard.vue`). Este archivo es la fuente de
// verdad de ESE MISMO copy, ahora como filas editables de `avisos`
// (`kind='system'`).
//
// `SYSTEM_AVISOS` es el catálogo puro (sin `db`): el copy literal que hoy
// vive hardcodeado, tal cual está en los componentes de arriba (verificado
// archivo por archivo, no inventado). `seedSystemAvisos` es la función
// idempotente que lo siembra para UN tenant.
//
// D-22 — NUNCA HAY QUE "INICIALIZAR"
// -----------------------------------
// Los avisos de sistema nacen por DOS caminos, y ninguno es manual:
//   1. La migración de datos `0217_seed_system_avisos.sql`, para los
//      tenants que ya existen hoy (mismo catálogo, mismo copy literal).
//   2. `seedSystemAvisos(db, ctx)`, que el wizard de alta de tenant de la
//      fase 182 va a llamar cuando v6.1 se integre — para los tenants
//      nuevos.
// Los dos caminos comparten el mismo set de 7 `code`s y el mismo copy: si
// alguna vez se edita el catálogo de acá, la migración 0217 queda como
// snapshot histórico (ya aplicada, no se re-edita) y SOLO el camino 2 sigue
// vigente para altas futuras.
//
// IDEMPOTENCIA Y RESPETO POR EDICIONES (T-193-08)
// -------------------------------------------------
// `seedSystemAvisos` lee los `code` que YA existen para el tenant
// (`tenantWhere` + `kind='system'`) e inserta SOLO los que faltan
// (`tenantValues`). Nunca hace UPDATE: si el admin editó el título de un
// aviso de sistema, una re-siembra (una migración re-aplicada a mano, un
// alta de tenant reintentada) no le pisa el cambio.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { avisos } from "../../db/schema";
import { tenantWhere, tenantValues, type TenantContext } from "../shared/tenant";
import type { AppSectionKey } from "./destinations";

type DbInstance = MySql2Database<typeof schema>;

/** Los 7 avisos de sistema (D-08, D-09, D-10, D-15a). */
export const SYSTEM_AVISO_CODES = [
  "rating_prompt",
  "improvement_prompt",
  "plan_expiry",
  "card_improvement",
  "card_referral",
  "card_upsell",
  "card_program",
] as const;

export type SystemAvisoCode = (typeof SYSTEM_AVISO_CODES)[number];

/** Forma de un aviso de sistema en el catálogo. Todos `kind: 'system'` (implícito, no es campo del seed). */
export interface SystemAvisoSeed {
  code: SystemAvisoCode;
  placement: "popup" | "tarjeta";
  title: string;
  body: string;
  buttonText: string;
  destinationType: "app_section" | "whatsapp_sales";
  /** Solo aplica a `destinationType: "app_section"`. */
  destinationSection: AppSectionKey | null;
  /** Solo aplica a `destinationType: "whatsapp_sales"`. */
  whatsappText: string | null;
  frequencyType: "once" | "every_n_days" | "every_open";
  frequencyDays: number | null;
  status: "draft" | "active" | "paused";
  /** D-15(b): orden entre tarjetas. 0 para los pop-ups (no ordenan entre sí). */
  sortOrder: number;
}

/**
 * Catálogo de los 7 avisos de sistema, con el copy literal de la app HOY
 * (2026-09-02, ver `read_first` del plan 193-03 para el archivo fuente de
 * cada uno). `startsOn`/`endsOn`/`scope*` quedan implícitamente NULL: ningún
 * aviso de sistema nace con vigencia ni alcance — son globales por defecto
 * y el admin los acota después si quiere.
 */
export const SYSTEM_AVISOS: SystemAvisoSeed[] = [
  {
    // RatingPromptDialog.vue: título genérico (el real es class-framed con
    // el nombre de la actividad cuando aplica — eso sigue resolviéndolo la
    // app, este es el copy base). Body = el helper text del diálogo.
    // D-08: cadencia editable, default ventana móvil de 7 días desde la
    // última vez que se pidió.
    code: "rating_prompt",
    placement: "popup",
    title: "¿Cómo estuvo tu clase?",
    body: "Tu opinión es anónima y nos ayuda a mejorar las clases.",
    buttonText: "Puntuar",
    destinationType: "app_section",
    destinationSection: "mi_templo",
    whatsappText: null,
    frequencyType: "every_n_days",
    frequencyDays: 7,
    status: "active",
    sortOrder: 0,
  },
  {
    // ImprovementPromptDialog.vue, copy literal del título y del párrafo de
    // pregunta. D-09: reemplaza los 14 días de re-prompt local + 30 días de
    // silencio server-side por esta única frecuencia (equivalente a la
    // recurrencia mensual de hoy).
    code: "improvement_prompt",
    placement: "popup",
    title: "¿Qué mejorarías de El Templo?",
    body: "El equipo está escuchando: contanos qué te gustaría para darte la mejor experiencia.",
    buttonText: "Enviar sugerencia",
    destinationType: "app_section",
    destinationSection: "proponer_mejora",
    whatsappText: null,
    frequencyType: "every_n_days",
    frequencyDays: 30,
    status: "active",
    sortOrder: 0,
  },
  {
    // PlanExpiryDialog.vue. El body usa el token literal `{dias}` donde hoy
    // va el número calculado por la app (singular/plural, "vence hoy"): la
    // sustitución la sigue haciendo la app, este seed no la resuelve.
    // D-10: la REGLA de disparo (≤3 días, diario, supresión por cobertura,
    // fase 144) queda FIJA EN CÓDIGO — solo texto y botón son editables acá.
    code: "plan_expiry",
    placement: "popup",
    title: "Tu membresía está por vencer",
    body: "Te quedan {dias} de acceso. Renovala por WhatsApp para no perder tu lugar en las clases.",
    buttonText: "Renovar por WhatsApp",
    destinationType: "whatsapp_sales",
    destinationSection: null,
    whatsappText: "Hola, quiero renovar mi membresía 💪",
    frequencyType: "every_n_days",
    frequencyDays: 1,
    status: "active",
    sortOrder: 0,
  },
  {
    // ImprovementCtaCard.vue (carrusel de Mi Templo). Tarjetas: sin
    // frecuencia por socio (D-15b, el carrusel se ve en cada apertura) —
    // `every_open` es el valor semánticamente equivalente que exige la
    // columna NOT NULL del schema.
    code: "card_improvement",
    placement: "tarjeta",
    title: "¿Qué mejorarías de El Templo?",
    body: "El equipo está escuchando: contanos qué te gustaría para darte la mejor experiencia.",
    buttonText: "Enviar sugerencia",
    destinationType: "app_section",
    destinationSection: "proponer_mejora",
    whatsappText: null,
    frequencyType: "every_open",
    frequencyDays: null,
    status: "active",
    sortOrder: 1,
  },
  {
    // ReferralCtaCard.vue. Título = variante A de `COPIES` (v5.5 A/B test),
    // subtítulo = `SUBTITLE` compartido por las dos variantes.
    //
    // El test A/B de copy por paridad de `user.id` (v5.5) queda superado
    // por el copy editable de D-15 — la app deja de elegir variante en el
    // plan 193-15 y este seed fija la variante A. El endpoint de clics de
    // referidos (`POST /members/referrals/cta-click`) NO cambia.
    code: "card_referral",
    placement: "tarjeta",
    title: "Vos decidís cuánto bajás tu cuota",
    body: "Invitá a entrenar: cada persona que traigas suma descuento a tu cuota.",
    buttonText: "Compartir código",
    destinationType: "app_section",
    destinationSection: "referidos",
    whatsappText: null,
    frequencyType: "every_open",
    frequencyDays: null,
    status: "active",
    sortOrder: 2,
  },
  {
    // UpsellBadge.vue.
    code: "card_upsell",
    placement: "tarjeta",
    title: "Llevalo al siguiente nivel",
    body: "Visitá nuestras sedes y entrená junto a nuestros entrenadores",
    buttonText: "Más info",
    destinationType: "whatsapp_sales",
    destinationSection: null,
    whatsappText: "Hola, me interesa entrenar de forma presencial",
    frequencyType: "every_open",
    frequencyDays: null,
    status: "active",
    sortOrder: 3,
  },
  {
    // ProgramCtaCard.vue. El `<h3>` real lleva un `<br />` entre "plan" y
    // "diseñado para vos" — acá se guarda como salto de línea real (`\n`),
    // no como HTML: el editor de avisos es texto plano (D-12).
    code: "card_program",
    placement: "tarjeta",
    title: "Entrená con un plan\ndiseñado para vos",
    body: "Creamos programas enfocados en tus objetivos, con seguimiento personalizado",
    buttonText: "Mi Plan",
    destinationType: "whatsapp_sales",
    destinationSection: null,
    whatsappText: "Hola! Quiero saber más sobre mi plan personalizado 💪",
    frequencyType: "every_open",
    frequencyDays: null,
    status: "active",
    sortOrder: 4,
  },
];

/**
 * Siembra los avisos de sistema faltantes para el tenant de `ctx`.
 * Idempotente y reutilizable (D-22): nunca pisa una fila existente (ni su
 * copy editado por el admin), solo inserta los `code` que todavía no
 * existen para ese tenant. Devuelve cuántos insertó.
 *
 * Esta es la función que el wizard de alta de tenant de la fase 182 va a
 * llamar cuando v6.1 se integre — para que un tenant nuevo nazca con sus 7
 * avisos de sistema sin que nadie tenga que "inicializar" nada (D-22).
 */
export async function seedSystemAvisos(
  db: DbInstance,
  ctx: TenantContext,
): Promise<{ inserted: number }> {
  const existing = await db
    .select({ code: avisos.code })
    .from(avisos)
    .where(and(tenantWhere(avisos, ctx), eq(avisos.kind, "system")));
  const existingCodes = new Set(existing.map((row) => row.code));

  let inserted = 0;
  for (const seed of SYSTEM_AVISOS) {
    if (existingCodes.has(seed.code)) continue;

    await db.insert(avisos).values(
      tenantValues(ctx, {
        kind: "system" as const,
        code: seed.code,
        placement: seed.placement,
        title: seed.title,
        body: seed.body,
        buttonText: seed.buttonText,
        destinationType: seed.destinationType,
        destinationSection: seed.destinationSection,
        whatsappText: seed.whatsappText,
        frequencyType: seed.frequencyType,
        frequencyDays: seed.frequencyDays,
        status: seed.status,
        sortOrder: seed.sortOrder,
      }),
    );
    inserted++;
  }

  return { inserted };
}
