/**
 * Reglas puras de la bandeja de avisos (fase 215, plan 12; D-17 y D-18).
 *
 * Un solo lugar define el cursor de paginación, el tipo de aviso y la clave
 * anti-duplicado. No importa nada de la base: lo usan el servicio de la bandeja
 * (escritura y lectura) y los jobs que encolan avisos.
 */
import { createHash } from "node:crypto";

/** Días que se conserva un aviso en la bandeja antes de la purga. */
export const INBOX_RETENTION_DAYS = 90;
/** Cantidad de avisos por página si el pedido no dice otra cosa. */
export const INBOX_PAGE_DEFAULT = 30;
/** Máximo de avisos por página. */
export const INBOX_PAGE_MAX = 50;
/** Tipo de aviso del regalo de Aura. */
export const INBOX_GIFT_KIND = "aura_gift";
/** Largo de la columna `dedupe_key`. */
export const INBOX_DEDUPE_KEY_MAX = 160;
/** Largo de la columna `kind`. */
const INBOX_KIND_MAX = 32;

/**
 * Cursor `"<epochMs>.<id>"`: se pagina por `(shown_at, id)` descendente. Un
 * aviso programado puede tener un `id` menor y mostrarse después, por eso el
 * `id` solo no alcanza.
 */
export function formatInboxCursor(shownAt: Date, id: number): string {
  return `${shownAt.getTime()}.${id}`;
}

/** Devuelve null si el texto no es un cursor válido. */
export function parseInboxCursor(
  raw: string,
): { shownAtMs: number; id: number } | null {
  if (!/^\d+\.\d+$/.test(raw)) return null;
  const [msText, idText] = raw.split(".");
  const shownAtMs = Number(msText);
  const id = Number(idText);
  if (!Number.isSafeInteger(shownAtMs) || !Number.isSafeInteger(id)) {
    return null;
  }
  if (id < 1) return null;
  return { shownAtMs, id };
}

/**
 * Tipo de aviso que se guarda: el explícito (`aura_gift`), si no la categoría
 * de la push, si no `otro`. Se corta al largo de la columna.
 */
export function inboxKindFor(input: {
  inboxKind: string | null | undefined;
  category: string | null | undefined;
}): string {
  const kind = input.inboxKind || input.category || "otro";
  return kind.slice(0, INBOX_KIND_MAX);
}

export type InboxDedupeInput =
  | {
      source: "template";
      templateKey: string;
      bookingId?: number | null;
      shownAt: Date;
      title: string;
      body: string;
    }
  | {
      source: "adhoc";
      category: string;
      inboxKind?: string | null;
      inboxRefId?: number | null;
      shownAt: Date;
      title: string;
      body: string;
    };

function sha1Hex(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function textFingerprint(title: string, body: string): string {
  return sha1Hex(`${title}\n${body}`).slice(0, 16);
}

/**
 * Clave anti-duplicado de un aviso que NO tiene fila en la cola (persona sin
 * push). Evita que un job que reintenta en cada tick (`class_reminder`: cada 5
 * minutos, con ventana de 10) deje dos filas iguales en la bandeja.
 *
 * Dos avisos distintos del mismo día no chocan porque el texto entra en la
 * clave. El día va en UTC a propósito: solo separa repeticiones, nunca se
 * muestra. Si la clave pasa del largo de la columna se devuelve `h:` más el
 * sha1 completo de la clave.
 */
export function inboxDedupeKey(input: InboxDedupeInput): string {
  let key: string;
  if (input.source === "template") {
    if (input.bookingId != null) {
      key = `t:${input.templateKey}:b${input.bookingId}`;
    } else {
      key = `t:${input.templateKey}:${utcDay(input.shownAt)}:${textFingerprint(input.title, input.body)}`;
    }
  } else if (input.inboxRefId != null) {
    key = `a:${input.inboxKind || input.category}:${input.inboxRefId}`;
  } else {
    key = `a:${input.category}:${utcDay(input.shownAt)}:${textFingerprint(input.title, input.body)}`;
  }

  if (key.length > INBOX_DEDUPE_KEY_MAX) {
    return `h:${sha1Hex(key)}`;
  }
  return key;
}
