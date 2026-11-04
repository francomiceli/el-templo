/**
 * Catálogo de los detectores de temas automáticos de Oficina (Fase 205).
 *
 * Fuente única de las seis señales: las usan el runner (`auto-topics.ts`), los
 * avisos silenciados (`auto-topics-mutes.ts`) y el panel "Avisos automáticos"
 * (`auto-topics-settings.ts`). Sin imports: no puede formar ciclos.
 *
 * `perBranch` dice si el aviso se puede apagar sede por sede. Los temas de
 * `wellhub_error` no tienen sede (se apagan solo para el gimnasio entero).
 */

export const WELLHUB_PREFIX = "wellhub_event:";
export const STAFF_SHIFT_PREFIX = "staff_shift:";
export const CLASS_NO_COACH_PREFIX = "clase_sin_profe:";
export const CASH_DIFF_PREFIX = "arqueo_dif:";
export const WELLHUB_UNPUBLISHED_PREFIX = "wellhub_sin_publicar:";
export const TABLERO_LEADS_PREFIX = "tablero_leads:";

/** Claves de los detectores, en el orden en que corre el job. */
export const OFFICE_AUTO_DETECTOR_KEYS = [
  "wellhub_error",
  "jornada_abierta",
  "clase_sin_profe",
  "arqueo_diferencia",
  "wellhub_sin_publicar",
  "tablero_leads",
] as const;
export type OfficeAutoDetectorKey = (typeof OFFICE_AUTO_DETECTOR_KEYS)[number];

export interface OfficeAutoDetectorInfo {
  key: OfficeAutoDetectorKey;
  label: string;
  description: string;
  /** `true` si el aviso se puede apagar para una sede puntual. */
  perBranch: boolean;
  /** Prefijo del `source_key` de los temas que abre este detector. */
  sourcePrefix: string;
}

export const OFFICE_AUTO_DETECTORS: readonly OfficeAutoDetectorInfo[] = [
  {
    key: "wellhub_error",
    label: "Webhook de Wellhub con error",
    description:
      "Abre un tema cuando Wellhub nos manda un evento que no se pudo procesar.",
    perBranch: false,
    sourcePrefix: WELLHUB_PREFIX,
  },
  {
    key: "jornada_abierta",
    label: "Jornada de staff sin cerrar",
    description:
      "Abre un tema cuando alguien del equipo entró un día anterior y no registró la salida.",
    perBranch: true,
    sourcePrefix: STAFF_SHIFT_PREFIX,
  },
  {
    key: "clase_sin_profe",
    label: "Clase de mañana sin profe",
    description:
      "Abre un tema por cada clase de mañana que no tiene profe en el roster ni en el horario.",
    perBranch: true,
    sourcePrefix: CLASS_NO_COACH_PREFIX,
  },
  {
    key: "arqueo_diferencia",
    label: "Arqueo de caja con diferencia",
    description:
      "Abre un tema cuando el arqueo de una caja da una diferencia entre lo esperado y lo contado. Las cajas sin sede solo se apagan para todo el gimnasio.",
    perBranch: true,
    sourcePrefix: CASH_DIFF_PREFIX,
  },
  {
    key: "wellhub_sin_publicar",
    label: "Wellhub: clases de mañana sin publicar",
    description:
      "Abre un tema por sede cuando hay clases de mañana que no se publicaron en Wellhub.",
    perBranch: true,
    sourcePrefix: WELLHUB_UNPUBLISHED_PREFIX,
  },
  {
    key: "tablero_leads",
    label: "Tablero: leads sin cargar",
    description:
      "Abre un tema por semana con las sedes que todavía no cargaron los leads en el Tablero.",
    perBranch: true,
    sourcePrefix: TABLERO_LEADS_PREFIX,
  },
];

export function isOfficeAutoDetectorKey(
  value: string,
): value is OfficeAutoDetectorKey {
  return (OFFICE_AUTO_DETECTOR_KEYS as readonly string[]).includes(value);
}

export function getOfficeAutoDetector(
  key: OfficeAutoDetectorKey,
): OfficeAutoDetectorInfo {
  const info = OFFICE_AUTO_DETECTORS.find((d) => d.key === key);
  if (info === undefined) {
    throw new Error(`Detector de Oficina desconocido: ${key}`);
  }
  return info;
}

/** Motivo con el que se cierran los temas abiertos de un aviso que se apagó. */
export const AUTO_TOPIC_MUTED_REASON =
  "Aviso desactivado desde Avisos automáticos";

/** Motivo del cierre del tema agregado del Tablero cuando solo faltan sedes silenciadas. */
export const TABLERO_MUTED_BRANCHES_REASON =
  "Las sedes que faltan tienen el aviso desactivado";
