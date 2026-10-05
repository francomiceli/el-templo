/**
 * Payload de la intro "el recorrido de hoy" de la TV de sucursal.
 *
 * Funcion PURA sobre un `ClassDay` ya resuelto: el servicio solo la invoca
 * cuando `screen === "recorrido"` (el poll normal no paga este calculo).
 *
 * Reglas:
 *  - Se recorre el roster del dia (`buildRoster`, el MISMO que usa la TV) en
 *    orden, SIN INITIUM (PYROS): el recorrido se lanza justamente desde ahi.
 *  - Se agrupa por grupo visual (`visualGroupOf`): DEUTEROS_1+DEUTEROS_2 es UN
 *    item, `*_II` + `*_II_ALT` tambien. `role` es el primero del grupo.
 *  - `title`: el rotulo que la TV ya le pone al bloque, o sea la etiqueta de
 *    `roster.title` (todo lo que va antes del " · FORMATO" de `blockTitle`,
 *    que respeta ATHLOS/EPIKOS por bloque). El roster no tiene un rotulo de
 *    GRUPO, asi que para DEUTEROS se le quita el numeral final (" I"/" II")
 *    del primer rol: "DEUTEROS I" -> "DEUTEROS". El resto de los grupos
 *    conserva su rotulo tal cual ("COMBOS II", "TÉCNICA I", "KINESIS", "TREN
 *    INFERIOR"): ahi el numeral es parte del nombre, no una variante.
 *  - `subtitle`: rutas de los bloques del grupo (todos los niveles), con
 *    `getRouteLabel`, distintas, unidas con " · ". `null` en roles sin ruta "de
 *    ejercicio" (INITIUM/STRETCHING/ROM_*: en ROM la ruta es el propio rol).
 *  - `zonas`: union de las zonas de TODAS las prescripciones `main` de todos
 *    los niveles de los bloques del grupo (`muscle-zones.ts`), con fallback
 *    por rol en ROM. Un grupo sin zonas igual se incluye (el front no pinta).
 */
import { findBlock, buildRoster, visualGroupOf } from "./roster";
import type { RosterClassDay } from "./roster";
import type { ClassDay, ClassDayBlock } from "./class-day";
import { getRouteLabel } from "./route-labels";
import { zonasDelGrupo, type EjercicioZonaInput } from "./muscle-zones";
import type { TvRecorridoBloque, TvRecorridoPayload } from "./types";

/** Separador de " · " entre el rotulo y el formato de `blockTitle` (roster.ts). */
const TITLE_SEPARATOR = " · ";

/** Roles cuya `route` NO es una ruta de ejercicio (en ROM es el propio rol). */
function hasExerciseRoute(role: string): boolean {
  return (
    role !== "INITIUM" && role !== "STRETCHING" && !role.startsWith("ROM_")
  );
}

/** Rotulo del grupo visual a partir del `title` del primer rol del roster. */
function groupTitle(group: string, firstTitle: string): string {
  const label = firstTitle.split(TITLE_SEPARATOR)[0];
  // DEUTEROS I/II son caminos del mismo bloque: el rotulo del grupo no lleva numeral.
  if (group === "DEUTEROS") return label.replace(/\s+(I|II)$/, "");
  return label;
}

export function buildRecorrido(classDay: ClassDay): TvRecorridoPayload {
  // `ClassDay` es asignable a `RosterClassDay` (mismo patron que `buildRoster`).
  const roster = buildRoster(classDay satisfies RosterClassDay);

  // Grupos en orden de aparicion, sin INITIUM.
  const groups = new Map<string, { roles: string[]; firstTitle: string }>();
  for (const entry of roster) {
    if (entry.role === "INITIUM") continue;
    const key = visualGroupOf(entry.role);
    const group = groups.get(key);
    if (group) group.roles.push(entry.role);
    else groups.set(key, { roles: [entry.role], firstTitle: entry.title });
  }

  // Sesiones en el orden canonico de niveles del dia: subtitulo estable.
  const sessions = [...classDay.sessions].sort(
    (a, b) =>
      classDay.levels.indexOf(a.memberLevel) -
      classDay.levels.indexOf(b.memberLevel),
  );

  const bloques: TvRecorridoBloque[] = [];
  for (const [key, group] of groups) {
    const blocks: ClassDayBlock[] = [];
    for (const session of sessions) {
      for (const role of group.roles) {
        const block = findBlock(session.blocks, role);
        if (block && !blocks.includes(block)) blocks.push(block);
      }
    }

    const ejercicios: EjercicioZonaInput[] = [];
    for (const block of blocks) {
      for (const p of block.prescriptions) {
        if (p.exerciseType !== "main") continue;
        ejercicios.push({
          category: p.exerciseCategory,
          categorySecondary: p.exerciseCategorySecondary,
          route: p.exerciseRoute,
        });
      }
    }

    const routes: string[] = [];
    if (group.roles.some(hasExerciseRoute)) {
      for (const block of blocks) {
        const label = getRouteLabel(block.route);
        if (label && !routes.includes(label)) routes.push(label);
      }
    }

    bloques.push({
      role: group.roles[0],
      title: groupTitle(key, group.firstTitle),
      subtitle: routes.length > 0 ? routes.join(TITLE_SEPARATOR) : null,
      zonas: zonasDelGrupo(ejercicios, group.roles),
    });
  }

  return { bloques };
}
