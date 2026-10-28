/**
 * useAttribution -- origen del visitante (first-touch) para el alta en la app
 * (fase 195, D-18, lado web).
 *
 * `capture()` guarda en `sessionStorage` (`et_ft_v1`) el primer contacto de la
 * sesion: `utm_*`, `fbclid`, `gclid`, `promo`, host del referrer externo
 * (`src_ref`), pagina de aterrizaje (`landing`) y timestamp (`ft`). Nunca pisa
 * un first-touch ya guardado. `registerParams()` devuelve esos valores (mas
 * `fbp`) para agregarlos al link "Reservá online" hacia `app.eltemplo.org/register`.
 *
 * RGPD (D-22, T-195-21): en `/es` no se guarda ni se reenvia NADA hasta que la
 * persona acepta el consentimiento (`consentState` de useConsent, via `getConsent()`). Los valores salen truncados a 255
 * caracteres y solo con las claves del contrato (la app las valida de nuevo).
 *
 * Hidratacion: dentro de un componente, `registerParams()` devuelve `{}` hasta
 * que ESE componente se monta (`onMounted`), para que el primer render coincida
 * con el HTML estatico (Vue no corrige atributos distintos al hidratar). Despues
 * se recalcula solo; `refresh()` fuerza el recalculo (navegacion, consentimiento).
 *
 * Siguiendo CLAUDE.md: expone cleanup() y no registra hooks de desmontaje.
 */
import { isEsPath } from "~/utils/analytics-loader";

export const FIRST_TOUCH_KEY = "et_ft_v1";

/** Parametros de campania que se leen de la URL. */
const URL_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "promo",
] as const;

/** Claves del contrato con `/register` (195-07): lo unico que sale de aca. */
const STORED_KEYS = [...URL_PARAM_KEYS, "src_ref", "landing", "ft"] as const;

const MAX_LENGTH = 255;

type Params = Record<string, string>;

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, MAX_LENGTH);
}

/** Host del referrer si es externo (los hosts de eltemplo.org no cuentan). */
function externalReferrerHost(): string {
  if (!document.referrer) return "";
  try {
    const host = new URL(document.referrer).hostname.toLowerCase();
    const own = host === "eltemplo.org" || host.endsWith(".eltemplo.org");
    return own ? "" : host;
  } catch {
    // referrer no parseable: se ignora.
    return "";
  }
}

function paramsFromUrl(): Params {
  const query = new URLSearchParams(window.location.search);
  const found: Params = {};
  for (const key of URL_PARAM_KEYS) {
    const value = clean(query.get(key));
    if (value) found[key] = value;
  }
  return found;
}

function readFirstTouch(): Params | null {
  try {
    const raw = window.sessionStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const stored = parsed as Record<string, unknown>;
    const found: Params = {};
    for (const key of STORED_KEYS) {
      const value = stored[key];
      if (typeof value === "string" && clean(value)) found[key] = clean(value);
    }
    return Object.keys(found).length > 0 ? found : null;
  } catch {
    // sessionStorage bloqueado o JSON invalido: sin first-touch guardado.
    return null;
  }
}

function readFbp(): string {
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("_fbp="));
  return cookie ? clean(decodeURIComponent(cookie.slice("_fbp=".length))) : "";
}

export function useAttribution() {
  // Cada `refresh()` suma 1 y vuelve a calcular los links que dependen de
  // `registerParams()` (cambio de consentimiento, navegacion).
  const version = useState<number>("et-attribution-version", () => 0);

  // Dentro de un componente: false hasta que ese componente se monta.
  const inComponent = getCurrentInstance() !== null;
  const mountedHere = ref(!inComponent);
  if (inComponent) {
    onMounted(() => {
      mountedHere.value = true;
    });
  }

  /** Guarda el first-touch si todavia no hay uno (en /es, solo con consentimiento). */
  function capture(): void {
    if (import.meta.server) return;
    if (isEsPath(window.location.pathname) && getConsent() !== "granted")
      return;
    if (readFirstTouch()) return;
    const touch: Params = {
      ...paramsFromUrl(),
      landing: clean(window.location.pathname),
      ft: String(Date.now()),
    };
    const referrer = externalReferrerHost();
    if (referrer) touch.src_ref = referrer;
    try {
      window.sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
    } catch {
      // sin sessionStorage: registerParams() usa solo los params de la URL actual.
    }
  }

  /**
   * Parametros para `buildRegisterUrl(params, registerParams())`. `{}` en el
   * servidor, antes de montar el componente y en /es sin consentimiento.
   */
  function registerParams(): Params {
    void version.value; // dependencia reactiva: refresh() recalcula los links
    if (import.meta.server || !mountedHere.value) return {};
    if (isEsPath(window.location.pathname) && getConsent() !== "granted") {
      return {};
    }
    const params = readFirstTouch() ?? paramsFromUrl();
    const fbp = readFbp();
    if (fbp) params.fbp = fbp;
    return params;
  }

  /** Avisa que cambio algo (navegacion, consentimiento). */
  function refresh(): void {
    version.value += 1;
  }

  function cleanup(): void {
    // No-op: no hay listeners ni timers por instancia.
  }

  return { capture, registerParams, refresh, cleanup };
}
