// Módulo: communications — destino común (Fase 193, D-01, D-02, D-03, D-04)
//
// QUÉ ES
// ------
// La fuente de verdad de "destino": a dónde lleva un tap en una push, un
// aviso pop-up, una tarjeta de Mi Templo o (más adelante) una placa de TV.
// Un destino es UNO de dos tipos: una sección curada de la app, o el
// WhatsApp de ventas con un texto pre-cargado editable.
//
// Este archivo NO expone rutas HTTP (eso es de los planes 04/05/06/08/09/14
// de la fase). Es un módulo puro: tipos + constantes + funciones de
// validación/resolución, sin `db` ni `request`.
//
// ESPEJOS (D-01)
// ---------------
// El repo no tiene un paquete de tipos compartido entre las 3 apps.
// `el-templo-admin/src/config/destinations.ts` y
// `el-templo-app/src/config/destinations.ts` duplican `APP_SECTIONS` a mano;
// `test/communications/destinations-sync.test.ts` rompe si divergen.
//
// FAIL-CLOSED ANTE UN DESTINO CORRUPTO (D-04, T-193-04)
// -------------------------------------------------------
// `resolveDestinationRoute` NUNCA lanza: una key desconocida (dato corrupto,
// versión vieja de la app, aviso mal migrado) cae a `FALLBACK_ROUTE`. Un
// destino roto no puede tumbar el render de un pop-up o una tarjeta.

/**
 * Las 7 secciones curadas de la app a las que puede apuntar un destino
 * `app_section`. Agregar una sección es un cambio de código chico: sumar un
 * valor acá (y en los dos espejos).
 */
export type AppSectionKey =
  | "mi_templo"
  | "reservas"
  | "programas"
  | "referidos"
  | "proponer_mejora"
  | "mi_plan"
  | "volver";

export interface AppSection {
  key: AppSectionKey;
  label: string;
  route: string;
}

/**
 * D-01: lista curada de secciones de la app, definida UNA vez acá.
 *
 * `programas` y `mi_plan` apuntan hoy a la MISMA ruta `/planes` porque
 * `PlanesPage.vue` contiene las dos secciones ("Planes Por Objetivos" =
 * programas, "Tu plan actual" = mi plan) y la app no registra hoy una ruta
 * propia de programas (ver `el-templo-app/src/modules/plan/routes.ts`). Si
 * en el futuro se registra una ruta propia, se cambia SOLO esta tabla (y sus
 * dos espejos).
 */
export const APP_SECTIONS: readonly AppSection[] = [
  {
    key: "mi_templo",
    label: "Mi Templo",
    route: "/mi-templo",
  },
  {
    key: "reservas",
    label: "Reservas",
    route: "/reservas",
  },
  {
    key: "programas",
    label: "Programas",
    route: "/planes",
  },
  {
    key: "referidos",
    label: "Referidos",
    route: "/mis-referidos",
  },
  {
    key: "proponer_mejora",
    label: "Proponer mejora",
    route: "/proponer-mejora",
  },
  {
    key: "mi_plan",
    label: "Mi plan",
    route: "/planes",
  },
  {
    key: "volver",
    label: "Volver",
    route: "/volver",
  },
];

/** Los dos tipos de destino (D-01). */
export type DestinationType = "app_section" | "whatsapp_sales";

/**
 * Un destino ya validado. `section` solo aplica a `app_section`;
 * `whatsappText` solo aplica a `whatsapp_sales` (`null` = usar
 * {@link DEFAULT_WHATSAPP_TEXT}).
 */
export interface Destination {
  type: DestinationType;
  section: AppSectionKey | null;
  whatsappText: string | null;
}

/**
 * D-02: texto de WhatsApp por defecto global, usado cuando un destino
 * `whatsapp_sales` no trae `whatsappText` propio.
 */
export const DEFAULT_WHATSAPP_TEXT =
  "Hola! Quiero más información sobre El Templo";

/** D-03: ruta interna nueva de la app que salta a WhatsApp de ventas. */
export const CONTACT_SALES_ROUTE = "/contacto-ventas";

/** D-04: ruta de fallback para apps viejas o destinos corruptos. Nunca 404. */
export const FALLBACK_ROUTE = "/mi-templo";

const APP_SECTION_KEYS: ReadonlySet<string> = new Set(
  APP_SECTIONS.map((section) => section.key),
);

const APP_SECTION_ROUTE_BY_KEY: ReadonlyMap<AppSectionKey, string> = new Map(
  APP_SECTIONS.map((section) => [section.key, section.route]),
);

/** Type guard: si `value` es una de las 7 keys curadas de {@link APP_SECTIONS}. */
export function isAppSectionKey(value: unknown): value is AppSectionKey {
  return typeof value === "string" && APP_SECTION_KEYS.has(value);
}

/**
 * Ruta interna a la que resuelve un destino ya validado. Nunca lanza
 * (D-04/T-193-04): una `section` desconocida cae a {@link FALLBACK_ROUTE}.
 */
export function resolveDestinationRoute(destination: Destination): string {
  if (destination.type === "whatsapp_sales") {
    return CONTACT_SALES_ROUTE;
  }
  if (destination.section && isAppSectionKey(destination.section)) {
    return APP_SECTION_ROUTE_BY_KEY.get(destination.section) ?? FALLBACK_ROUTE;
  }
  return FALLBACK_ROUTE;
}

/**
 * La ruta que viaja en `data.route` del payload FCM para apps viejas (D-04):
 * la propia ruta de la sección para `app_section`, y {@link FALLBACK_ROUTE}
 * para `whatsapp_sales` (una app vieja no sabe abrir WhatsApp desde acá).
 */
export function fallbackRouteFor(destination: Destination): string {
  if (destination.type === "app_section") {
    return resolveDestinationRoute(destination);
  }
  return FALLBACK_ROUTE;
}

/** Longitud máxima del texto de WhatsApp editable (D-02). */
export const WHATSAPP_TEXT_MAX_LENGTH = 300;

/**
 * T-193-02: patrones prohibidos en el texto de WhatsApp editable — evita que
 * el admin arme un mensaje con links arbitrarios que se abren desde el
 * dominio de la marca.
 */
const FORBIDDEN_TEXT_PATTERNS = [/https?:\/\//i, /wa\.me/i];

/** Cuántos saltos de línea como máximo tolera el texto (T-193-02). */
const MAX_NEWLINES = 3;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * Valida el texto pre-cargado de WhatsApp de un destino/aviso/notificación
 * (D-02, T-193-02). Rechaza: vacío tras `trim`, más de
 * {@link WHATSAPP_TEXT_MAX_LENGTH} caracteres, `http://`/`https://`/`wa.me`,
 * o más de {@link MAX_NEWLINES} saltos de línea.
 */
export function validateWhatsAppText(
  text: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "El texto no puede estar vacío" };
  }
  if (trimmed.length > WHATSAPP_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      reason: `El texto no puede superar los ${WHATSAPP_TEXT_MAX_LENGTH} caracteres`,
    };
  }
  for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
    if (pattern.test(text)) {
      return { ok: false, reason: "El texto no puede contener links" };
    }
  }
  const newlineCount = text.split("\n").length - 1;
  if (newlineCount > MAX_NEWLINES) {
    return {
      ok: false,
      reason: `El texto no puede tener más de ${MAX_NEWLINES} saltos de línea`,
    };
  }
  return { ok: true };
}

/**
 * Normaliza y valida la forma completa de un destino (D-01/D-02/D-05):
 * - `app_section` exige `section` en la lista curada y `whatsappText: null`.
 * - `whatsapp_sales` exige `section: null` y `whatsappText` en `null` (usa
 *   el default global) o un texto que pase {@link validateWhatsAppText}.
 */
export function validateDestination(
  input: unknown,
): ValidationResult<Destination> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "El destino debe ser un objeto" };
  }

  const candidate = input as Record<string, unknown>;
  const { type, section, whatsappText } = candidate;

  if (type !== "app_section" && type !== "whatsapp_sales") {
    return {
      ok: false,
      reason: "El tipo de destino debe ser 'app_section' o 'whatsapp_sales'",
    };
  }

  if (type === "app_section") {
    if (!isAppSectionKey(section)) {
      return { ok: false, reason: "La sección de destino no es válida" };
    }
    if (whatsappText !== null && whatsappText !== undefined) {
      return {
        ok: false,
        reason: "Un destino de sección de app no lleva texto de WhatsApp",
      };
    }
    return { ok: true, value: { type, section, whatsappText: null } };
  }

  // type === "whatsapp_sales"
  if (section !== null && section !== undefined) {
    return {
      ok: false,
      reason: "Un destino de WhatsApp de ventas no lleva sección",
    };
  }
  if (whatsappText === null || whatsappText === undefined) {
    return { ok: true, value: { type, section: null, whatsappText: null } };
  }
  if (typeof whatsappText !== "string") {
    return { ok: false, reason: "El texto de WhatsApp debe ser texto" };
  }
  const textResult = validateWhatsAppText(whatsappText);
  if (!textResult.ok) {
    return { ok: false, reason: textResult.reason };
  }
  return { ok: true, value: { type, section: null, whatsappText } };
}
