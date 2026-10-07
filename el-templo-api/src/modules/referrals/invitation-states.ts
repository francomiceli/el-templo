// Módulo: referrals — derivación PURA de los estados de "Mis invitados" (Fase 194-19)
//
// Todo estado que ve el socio (o el staff) sobre una invitación se DERIVA en
// lectura, nunca se guarda ni lo mueve un cron ("100% derivados, nada manual",
// precedente CON-04 de partner-week). Este archivo es la ÚNICA definición de las
// reglas: no depende de la DB ni del reloj (recibe `today`), así el servicio de
// overview (194-19) y el listado de leads del admin (194-20, que la espeja en SQL
// con `invitationLeadStageSql`) comparten el mismo criterio y el mismo orden.
//
// Orden de `deriveInviteeState` (tabla de RESEARCH §Patrón 7, D-26e):
//   compró  + cobertura de membresía >= hoy   -> socio_activo
//   compró  + sin cobertura                   -> inactivo
//   no compró + (vencida | accesos agotados)  -> vencido     (D-26e)
//   no compró + vigente + usados > 0          -> entrenando
//   no compró + vigente + usados = 0          -> invitado
//
// `deriveLeadStage` (etapa del lead de invitación, D-18) usa el mismo criterio
// sin socio/inactivo: `convertido` si la invitación tiene `converted_at`, y si no
// invitado | entrenando | vencido.

/** Estado del invitado visto por el INVITADOR en "Mis invitados". */
export type InviteeState =
  | "socio_activo"
  | "inactivo"
  | "vencido"
  | "entrenando"
  | "invitado";

/** Etapa del lead de invitación (listado del admin y ficha del invitado). */
export type LeadStage = "invitado" | "entrenando" | "vencido" | "convertido";

/** Datos de los accesos de una invitación (los mismos para estado y etapa). */
interface AccessWindow {
  /** 'YYYY-MM-DD' en la tz de la sede de hoy (el llamador la resuelve). */
  today: string;
  /** Último día hábil de los accesos; `null` en un vínculo heredado sin invitación. */
  accessExpiresOn: string | null;
  /** `classes_budget` de la sub de accesos; `null` si no hay sub o no tiene cupo. */
  classesBudget: number | null;
  /** `classes_remaining` de la sub de accesos. */
  classesRemaining: number | null;
}

export interface InviteeStateInput extends AccessWindow {
  /** Compró una membresía paga no-trial creada desde la activación (o vínculo qualified heredado). */
  purchased: boolean;
  /** Cobertura de MEMBRESÍA del invitado (`deriveMembershipCoveredUntil`), o `null`. */
  membershipCoveredUntil: string | null;
}

export interface LeadStageInput extends AccessWindow {
  /** La invitación tiene `converted_at` (compró dentro de la ventana de D-13). */
  converted: boolean;
}

/**
 * Accesos usados = `classes_budget - classes_remaining` (mismo contador que la
 * app; incluye los no-shows descontados). Nunca se hardcodea 3. `null` si la sub
 * no tiene cupo definido. No baja de 0 ni pasa del presupuesto.
 */
export function accessesUsed(
  classesBudget: number | null,
  classesRemaining: number | null,
): number | null {
  if (classesBudget === null || classesRemaining === null) return null;
  return Math.min(classesBudget, Math.max(0, classesBudget - classesRemaining));
}

/** Los accesos ya no se pueden usar: ventana vencida o cupo agotado (D-26e). */
function accessesEnded(window: AccessWindow): boolean {
  const expired =
    window.accessExpiresOn !== null && window.today > window.accessExpiresOn;
  const exhausted = window.classesRemaining === 0;
  return expired || exhausted;
}

/** Vigentes (no terminaron): `entrenando` si ya usó alguno, `invitado` si no. */
function activeAccessStage(window: AccessWindow): "entrenando" | "invitado" {
  const used = accessesUsed(window.classesBudget, window.classesRemaining) ?? 0;
  return used > 0 ? "entrenando" : "invitado";
}

/** Estado del invitado en "Mis invitados" (reglas en el orden del docblock). */
export function deriveInviteeState(input: InviteeStateInput): InviteeState {
  if (input.purchased) {
    const covered =
      input.membershipCoveredUntil !== null &&
      input.membershipCoveredUntil >= input.today;
    return covered ? "socio_activo" : "inactivo";
  }
  if (accessesEnded(input)) return "vencido";
  return activeAccessStage(input);
}

/**
 * Etapa del lead de invitación (D-18). Mismas reglas y mismo orden que la
 * expresión SQL `invitationLeadStageSql` (194-20): `convertido` -> `vencido` ->
 * `entrenando` -> `invitado`. Si divergen, la fuente de verdad es esta función.
 */
export function deriveLeadStage(input: LeadStageInput): LeadStage {
  if (input.converted) return "convertido";
  if (accessesEnded(input)) return "vencido";
  return activeAccessStage(input);
}
