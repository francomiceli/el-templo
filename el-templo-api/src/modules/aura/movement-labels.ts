// Module: aura
//
// Textos por motivo del detalle privado de Aura (fase 214, D-13): cada fila del
// ledger se muestra al alumno con una frase clara en lugar del `description`
// interno. Los textos son los del UI-SPEC ("Borradores para aprobar", punto 6,
// tomados tal cual por D-69); la redacción final puede retocarse acá sin tocar
// la ruta.
//
// El parámetro `sourceType` es `string` y no `AuraSourceType` a propósito: una
// fila con un valor desconocido (fuente futura o dato viejo) cae en el texto
// genérico en vez de romper la respuesta.
import { formatMilestoneLabel } from "../shared/tenure-milestones";
import {
  GIFT_REFERENCE,
  GIFT_VOID_LABEL,
  giftMovementLabel,
  type GiftLabelInput,
} from "./gift-rules";

const REVERSAL_REFERENCE = "attendance_reversal";

const FIXED_LABELS: ReadonlyMap<string, string> = new Map([
  ["attendance", "Asistencia a clase"],
  ["onboarding_completion", "Completaste tu perfil"],
  ["training_completion", "Entrenamiento en la app"],
  ["goal_plan_completion", "Sesión de tu plan online"],
  ["extra_block", "Bloque libre"],
  ["stretch", "Estiramiento"],
  ["program_week_completion", "Semana de programa"],
  ["program_completion", "Programa completo"],
  ["profile_photo", "Foto de perfil"],
]);

function positiveRef(referenceId: number | null): number | null {
  return referenceId !== null && Number.isFinite(referenceId) && referenceId > 0
    ? referenceId
    : null;
}

/**
 * Texto de un movimiento del detalle privado.
 *
 * Fase 215: la fuente `social` es el regalo entre personas. El regalo recibido
 * se lee con quien lo dio y el motivo (D-13, D-19) y la anulación como "Regalo
 * anulado" (D-22), sin nombres. El cuarto parámetro lo arma la ruta con UNA
 * consulta por página; si falta (regalo borrado), cae en el texto genérico.
 */
export function auraMovementLabel(
  sourceType: string,
  referenceType: string | null,
  referenceId: number | null,
  gift?: GiftLabelInput | null,
): string {
  if (sourceType === "social") {
    return referenceType === GIFT_REFERENCE.void
      ? GIFT_VOID_LABEL
      : giftMovementLabel(gift ?? null);
  }

  if (sourceType === "manual_adjustment") {
    return referenceType === REVERSAL_REFERENCE
      ? "Asistencia anulada"
      : "Ajuste de Aura";
  }

  if (sourceType === "tenure_milestone") {
    const months = positiveRef(referenceId);
    return months === null
      ? "Antigüedad en El Templo"
      : `${formatMilestoneLabel(months)} en El Templo`;
  }

  if (sourceType === "streak_bonus") {
    const sessions = positiveRef(referenceId);
    return sessions === null
      ? "Días seguidos entrenando en la app"
      : `${sessions} días seguidos entrenando en la app`;
  }

  return FIXED_LABELS.get(sourceType) ?? "Movimiento de Aura";
}
