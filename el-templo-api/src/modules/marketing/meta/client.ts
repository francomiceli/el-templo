/**
 * Meta — cliente HTTP mínimo de la Graph API (fase 195, plan 08).
 *
 * `fetch` nativo y `AbortSignal.timeout`: sin SDK de Meta. El token viaja en el
 * body (POST) o como parámetro de la URL (GET, como lo documenta Meta), pero
 * JAMÁS se loguea ni la URL ni el body: los errores salen con el status y el
 * `error.message` de Meta, recortado a 500 caracteres y con cualquier
 * ocurrencia del token reemplazada por `***` (T-195-31).
 */

const GRAPH_ORIGIN = "https://graph.facebook.com";
const TIMEOUT_MS = 20_000;
const MAX_ERROR_LENGTH = 500;
/** Tope de páginas por consulta: un `paging.next` en bucle no cuelga el job. */
const MAX_PAGES = 50;

export interface GraphCredentials {
  token: string;
  graphVersion: string;
}

/** Error de la Graph API (o de red). `message` ya viene redactado y recortado. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * Reemplaza el token (y cualquier `access_token=...` suelto) por `***` y recorta
 * a 500 caracteres. Se usa para todo texto que venga de Meta o de la red antes
 * de loguearlo o guardarlo en `last_error`.
 */
export function redactSecrets(text: string, token: string): string {
  let out = text;
  if (token.length > 0) out = out.split(token).join("***");
  out = out.replace(/(access_token=)[^&\s"']+/gi, "$1***");
  return out.slice(0, MAX_ERROR_LENGTH);
}

function errorFromBody(
  status: number,
  raw: string,
  token: string,
): MetaApiError {
  let detail = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const err = (parsed as { error?: unknown }).error;
      if (err && typeof err === "object" && "message" in err) {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string") detail = message;
      }
    }
  } catch {
    // Cuerpo que no es JSON: se usa el texto crudo (redactado abajo).
  }
  return new MetaApiError(
    redactSecrets(`Meta respondio ${status}: ${detail}`, token),
    status,
  );
}

function networkError(err: unknown, token: string): MetaApiError {
  const name = err instanceof Error ? err.name : "Error";
  const message = err instanceof Error ? err.message : "";
  return new MetaApiError(
    redactSecrets(`Error de red (${name}): ${message}`, token),
    0,
  );
}

async function readJson(response: Response, token: string): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) throw errorFromBody(response.status, raw, token);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new MetaApiError(
      "Meta devolvio una respuesta que no es JSON",
      response.status,
    );
  }
}

/** POST con el token en el body. Devuelve el JSON de la respuesta. */
export async function graphPost(
  creds: GraphCredentials,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${GRAPH_ORIGIN}/${creds.graphVersion}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, access_token: creds.token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: unknown) {
    throw networkError(err, creds.token);
  }
  return readJson(response, creds.token);
}

/**
 * `paging.next` solo se sigue si apunta a la Graph API por https (el `origin`
 * incluye el esquema: `http://graph.facebook.com` no coincide).
 */
function isGraphUrl(raw: string): boolean {
  try {
    return new URL(raw).origin === GRAPH_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * GET paginado: junta `data[]` de todas las páginas siguiendo `paging.next`
 * (que Meta devuelve con el token ya incluido: solo se sigue si es de la Graph
 * API, y nunca se loguea).
 */
export async function graphGetAll(
  creds: GraphCredentials,
  path: string,
  params: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const first = new URL(`${GRAPH_ORIGIN}/${creds.graphVersion}${path}`);
  for (const [key, value] of Object.entries(params)) {
    first.searchParams.set(key, value);
  }
  first.searchParams.set("access_token", creds.token);

  const rows: Array<Record<string, unknown>> = [];
  let next: string | null = first.toString();
  let pages = 0;

  while (next !== null) {
    if (++pages > MAX_PAGES) {
      throw new MetaApiError(
        "Meta devolvio demasiadas paginas de resultados",
        0,
      );
    }
    let response: Response;
    try {
      response = await fetch(next, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err: unknown) {
      throw networkError(err, creds.token);
    }
    const json = await readJson(response, creds.token);
    if (!json || typeof json !== "object") {
      throw new MetaApiError(
        "Meta devolvio una respuesta inesperada",
        response.status,
      );
    }
    const page = json as { data?: unknown; paging?: { next?: unknown } };
    if (Array.isArray(page.data)) {
      for (const row of page.data) {
        if (row && typeof row === "object")
          rows.push(row as Record<string, unknown>);
      }
    }
    const candidate = page.paging?.next;
    if (typeof candidate === "string" && candidate.length > 0) {
      if (!isGraphUrl(candidate)) {
        throw new MetaApiError(
          "Meta devolvio un paging.next fuera de graph.facebook.com",
          0,
        );
      }
      next = candidate;
    } else {
      next = null;
    }
  }
  return rows;
}
