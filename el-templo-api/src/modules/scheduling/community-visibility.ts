// Module: scheduling (fase 214, comunidad)
//
// Reglas puras de visibilidad de la lista de anotados. Sin DB ni reloj: la
// fecha local de la sede entra por parametro, asi las reglas se testean con
// bordes exactos.
//
// - D-05 / D-06: cada alumno tiene una preferencia guardada en el servidor
//   (`member_profiles.community_visible`, NULL = regla por defecto). La
//   preferencia explicita le gana a la regla: un menor puede activarse y un
//   adulto puede ocultarse.
// - D-07: reciprocidad. Un alumno solo ve la lista si el mismo es visible.
// - D-09: un alumno sin plan en vigor ve solo el numero de anotados.
// - D-11: por defecto son visibles todos salvo los menores de 18 y los de
//   sedes fuera de Argentina.
// - D-47: sin fecha de nacimiento cuenta como adulto, y al cumplir 18 pasa a
//   visible sin guardar nada (la regla se evalua a la fecha local de la sede).
// - D-44: no hay interruptor de encendido, por eso no existe un motivo
//   "apagado" en `listAccess`.

const ADULT_AGE = 18;
const DEFAULT_COUNTRY = "AR";

/**
 * Es menor de 18 a la fecha local `todayLocal` ("YYYY-MM-DD").
 *
 * Compara cadenas ISO (fecha de nacimiento + 18 años contra hoy), sin `Date`
 * con zona: no depende de la zona horaria del proceso. Un nacido el 29 de
 * febrero cumple el 1 de marzo en los años no bisiestos porque "02-29" no
 * existe y la cadena "2026-02-29" ordena despues del 28 de febrero. Sin fecha
 * de nacimiento cuenta como adulto (D-47).
 */
export function isMinor(
  dateOfBirth: string | null,
  todayLocal: string,
): boolean {
  if (!dateOfBirth) return false;
  const year = Number(dateOfBirth.slice(0, 4));
  if (!Number.isInteger(year)) return false;
  const eighteenth = `${String(year + ADULT_AGE).padStart(4, "0")}${dateOfBirth.slice(4, 10)}`;
  return eighteenth > todayLocal;
}

export interface DefaultVisibilityInput {
  dateOfBirth: string | null;
  branchCountry: string;
  todayLocal: string;
}

/** Regla por defecto (D-11, D-47): adulto y sede argentina. */
export function defaultVisible(input: DefaultVisibilityInput): boolean {
  return (
    !isMinor(input.dateOfBirth, input.todayLocal) &&
    input.branchCountry === DEFAULT_COUNTRY
  );
}

/** La preferencia explicita del alumno le gana a la regla por defecto (D-05). */
export function effectiveVisible(
  input: { preference: boolean | null } & DefaultVisibilityInput,
): boolean {
  return input.preference ?? defaultVisible(input);
}

export type ListAccessReason = "ok" | "sin_plan" | "oculto";

/**
 * Quien ve la lista (D-07, D-09): el staff siempre; un alumno solo con plan en
 * vigor y siendo el mismo visible. Si no, solo el numero.
 */
export function listAccess(input: {
  isStaff: boolean;
  hasPlanInEffect: boolean;
  viewerVisible: boolean;
}): { canSeeList: boolean; reason: ListAccessReason } {
  if (input.isStaff) return { canSeeList: true, reason: "ok" };
  if (!input.hasPlanInEffect) return { canSeeList: false, reason: "sin_plan" };
  if (!input.viewerVisible) return { canSeeList: false, reason: "oculto" };
  return { canSeeList: true, reason: "ok" };
}
