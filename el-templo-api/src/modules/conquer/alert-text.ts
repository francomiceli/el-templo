/**
 * Fase 201: frases de las alertas del coach (puro).
 *
 * Cita: anexo de Nacho `conquer-catalogo.md` §8 (tabla "Alertas y orden de
 * recorte") y DA-13 de 201-26. Cada alerta trae su frase con los datos del
 * evento (`Molestia 6/10 en Plancha el 21/10`); el admin solo la pinta, no tiene
 * vitest y no arma textos.
 *
 * CERO imports: corre con node por type-stripping (ver test/conquer/oracle-check.mjs).
 * Sin enum, sin namespace, sin clases ni parameter properties.
 */

type Detail = Record<string, unknown>;

/** "2026-10-21" (o un ISO con hora) -> "21/10". Sin `Date`: no hay zona horaria que mezclar. */
function shortDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return `${Number(match[3])}/${Number(match[2])}`;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

/** Alertas viejas sin `dayLabel`: el `dayKey` ("plancha") con mayúscula inicial. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Anexo §8: `Molestia {n}/10 en {dia} el {fecha}`. Cada dato que falta se omite. */
function painText(detail: Detail): string {
  const pain = typeof detail.pain === "number" ? detail.pain : null;
  const dayLabel = text(detail.dayLabel);
  const dayKey = text(detail.dayKey);
  const day = dayLabel ?? (dayKey === null ? null : capitalize(dayKey));
  const date = shortDate(detail.date);
  let out = pain === null ? "Molestia" : `Molestia ${pain}/10`;
  if (day !== null) out += ` en ${day}`;
  if (date !== null) out += ` el ${date}`;
  return out;
}

/** Anexo §8: `El E1 de {ejercicio} bajó 2 sesiones seguidas`. */
function fallText(detail: Detail): string {
  const name = text(detail.exerciseName) ?? "un ejercicio";
  return `El E1 de ${name} bajó 2 sesiones seguidas`;
}

/** Anexo §8: `Sin sesiones desde {fecha}`. Sin ninguna sesión (DA-13): frase propia. */
function inactiveText(detail: Detail): string {
  const date = shortDate(detail.lastSessionDate);
  return date === null
    ? "Todavía no registró sesiones"
    : `Sin sesiones desde ${date}`;
}

/** Anexo §8: `Sin control físico desde {fecha}`. Sin fecha (DA-13): frase propia. */
function checkOverdueText(detail: Detail): string {
  const date = shortDate(detail.lastCheckDate);
  return date === null
    ? "Sin control físico todavía"
    : `Sin control físico desde ${date}`;
}

/** "e1" | "e2" | "e3" -> 1 | 2 | 3; cualquier otro valor (el "combo") -> null. */
function stepNumber(step: unknown): number | null {
  if (step === "e1") return 1;
  if (step === "e2") return 2;
  if (step === "e3") return 3;
  return null;
}

/**
 * Anexo §8: `{ejercicio} E{n} llegó al tope de su escalera`. El tope de un combo
 * trae `step: "combo"` y el nombre ya dice "Combo X": sin número de escalón.
 */
function topText(detail: Detail): string {
  const name = text(detail.exerciseName) ?? "Un ejercicio";
  const n = stepNumber(detail.step);
  return n === null
    ? `${name} llegó al tope de su escalera`
    : `${name} E${n} llegó al tope de su escalera`;
}

/** Anexo §8: `{alumno} completó 4 semanas de su plan sin molestias`. */
function levelUpText(firstName: string): string {
  const name = text(firstName) ?? "El alumno";
  return `${name} completó 4 semanas de su plan sin molestias`;
}

/**
 * Frase de la alerta `kind` con los datos de `detail` (y el nombre de pila del
 * alumno para el paso de nivel). Nunca devuelve `undefined` ni "null" dentro del
 * texto: los datos que faltan se omiten o cambian la frase (DA-13).
 * `control_dia0_pendiente` (D-15) no está en el anexo: frase propia.
 */
export function alertText(
  kind: string,
  detail: Record<string, unknown>,
  memberFirstName: string,
): string {
  switch (kind) {
    case "molestia":
      return painText(detail);
    case "caida":
      return fallText(detail);
    case "inactivo":
      return inactiveText(detail);
    case "control_vencido":
      return checkOverdueText(detail);
    case "tope_escalera":
      return topText(detail);
    case "paso_nivel":
      return levelUpText(memberFirstName);
    case "control_dia0_pendiente":
      return "Todavía no hizo el control físico del día 0";
    default:
      return "Alerta del alumno";
  }
}
