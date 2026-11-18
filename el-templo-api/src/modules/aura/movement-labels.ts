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

const REVERSAL_REFERENCE = "attendance_reversal";

const FIXED_LABELS: ReadonlyMap<string, string> = new Map([
  ["attendance", "Asistencia a clase"],
  ["onboarding_completion", "Completaste tu perfil"],
  ["training_completion", "Entrenamiento en la app"],
  ["goal_plan_completion", "Sesión de tu plan"],
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

export function auraMovementLabel(
  sourceType: string,
  referenceType: string | null,
  referenceId: number | null,
): string {
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
    return sessions === null ? "Racha" : `Racha de ${sessions} sesiones`;
  }

  return FIXED_LABELS.get(sourceType) ?? "Movimiento de Aura";
}
