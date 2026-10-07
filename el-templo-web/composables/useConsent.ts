/**
 * useConsent -- consentimiento de analitica de Barcelona (fase 195, D-22).
 *
 * Estado compartido en toda la app (`useState`) y persistido en `localStorage`
 * (`et_consent_v1`). Solo importa en `/es`: Argentina no muestra banner.
 * `unknown` = todavia no eligio (se trata como "no"). El rechazo se respeta en
 * todo el sitio (ver `analyticsMode`).
 *
 * Following CLAUDE.md: exposes cleanup(), no onUnmounted inside.
 */
import { createLogger } from "~/utils/logger";
import type { ConsentValue } from "~/utils/analytics-loader";

export type ConsentState = ConsentValue;

export const CONSENT_STORAGE_KEY = "et_consent_v1";

const log = createLogger("useConsent");

// Espejo del estado para quien lo necesita fuera de un contexto Nuxt (handlers
// async de formularios via useAnalytics): `useState` no se puede llamar ahi.
let currentConsent: ConsentState = "unknown";

/** Consentimiento actual, usable en cualquier lado del cliente. */
export function getConsent(): ConsentState {
  return currentConsent;
}

// Un solo listener para toda la app (sincroniza el estado entre pestanas).
let storageListener: ((event: StorageEvent) => void) | null = null;

function readStored(): ConsentState {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "unknown";
  } catch (err: unknown) {
    // localStorage no disponible (modo privado, bloqueado): sin eleccion guardada.
    log.debug("No se pudo leer el consentimiento", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "unknown";
  }
}

function writeStored(value: ConsentState): void {
  try {
    if (value === "unknown") {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    }
  } catch (err: unknown) {
    log.debug("No se pudo guardar el consentimiento", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function useConsent() {
  const consentState = useState<ConsentState>("et-consent", () => "unknown");

  /** Lee la eleccion guardada (solo cliente) y sigue los cambios de otras pestanas. */
  function load(): void {
    if (import.meta.server) return;
    currentConsent = readStored();
    consentState.value = currentConsent;
    if (storageListener) return;
    storageListener = (event: StorageEvent) => {
      if (event.key === CONSENT_STORAGE_KEY || event.key === null) {
        currentConsent = readStored();
        consentState.value = currentConsent;
      }
    };
    window.addEventListener("storage", storageListener);
  }

  function set(value: ConsentState): void {
    currentConsent = value;
    consentState.value = value;
    writeStored(value);
  }

  function accept(): void {
    set("granted");
  }

  function reject(): void {
    set("denied");
  }

  /** Vuelve a preguntar (la persona retira o cambia su eleccion). */
  function reset(): void {
    set("unknown");
  }

  function cleanup(): void {
    if (storageListener) {
      window.removeEventListener("storage", storageListener);
      storageListener = null;
    }
  }

  return { consentState, load, accept, reject, reset, cleanup };
}
