/**
 * Payload de "el recorrido de hoy" de la TV de sucursal: la pantalla de inicio
 * cuando hay plani aprobada (2026-10-13; antes era una intro durante PYROS).
 *
 * Funcion PURA sobre un `ClassDay` ya resuelto: el servicio solo la invoca
 * en el poll de reposo (`idle`) con plani aprobada.
 *
 * Reglas:
 *  - Se recorre el roster del dia (`buildRoster`, el MISMO que usa la TV) en
 *    orden, SIN INITIUM (PYROS): la entrada en calor es compartida y no
 *    tiene zonas propias que mostrar.
 *  - Se agrupa por grupo visual (`visualGroupOf`): `*_II` + `*_II_ALT` es UN
 *    item (la alternativa es otro camino del mismo bloque). EXCEPCION: los
 *    deuteros van SIEMPRE desagregados (pedido 2026-10-05) — DEUTEROS_1 y
 *    DEUTEROS_2 trabajan cosas distintas y cada uno lleva su color.
 *    `role` es el primero del grupo.
 *  - `title`: el rotulo que la TV ya le pone al bloque, o sea la etiqueta de
 *    `roster.title` (todo lo que va antes del " · FORMATO" de `blockTitle`,
 *    que respeta ATHLOS/EPIKOS por bloque): "DEUTEROS I", "COMBOS II",
 *    "KINESIS", "TREN INFERIOR".
 *  - `subtitle`: rutas de los bloques del grupo (todos los niveles), con
 *    `getRouteLabel`, distintas, unidas con " · ". `null` en roles sin ruta "de
 *    ejercicio" (INITIUM/STRETCHING/ROM_*: en ROM la ruta es el propio rol).
 *  - Niveles: solo los que la TV esta mostrando (`niveles`, el par de
 *    `pairFor(state.level)` — las MISMAS columnas de la plani). Cada nivel hace
 *    un bloque distinto (DEUTEROS I: alfa cuadriceps, sigma empuje, spartan
 *    traccion): unir los seis pintaba el cuerpo entero.
 *  - `zonas`: las zonas DOMINANTES de las prescripciones `main` de esos
 *    niveles (`zonasDelGrupo`, `muscle-zones.ts`), con fallback por rol en ROM.
 *    Un grupo sin zonas igual se incluye (el front no pinta).
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

/** Rotulo del item a partir del `title` del primer rol del roster. */
function groupTitle(firstTitle: string): string {
  return firstTitle.split(TITLE_SEPARATOR)[0];
}

/** Clave de agrupacion: el grupo visual, salvo los deuteros (siempre separados). */
function recorridoGroupOf(role: string): string {
  if (role === "DEUTEROS_1" || role === "DEUTEROS_2") return role;
  return visualGroupOf(role);
}

export function buildRecorrido(
  classDay: ClassDay,
  niveles: readonly string[] = [],
): TvRecorridoPayload {
  // `ClassDay` es asignable a `RosterClassDay` (mismo patron que `buildRoster`).
  const roster = buildRoster(classDay satisfies RosterClassDay);

  // Grupos en orden de aparicion, sin INITIUM.
  const groups = new Map<string, { roles: string[]; firstTitle: string }>();
  for (const entry of roster) {
    if (entry.role === "INITIUM") continue;
    const key = recorridoGroupOf(entry.role);
    const group = groups.get(key);
    if (group) group.roles.push(entry.role);
    else groups.set(key, { roles: [entry.role], firstTitle: entry.title });
  }

  // Solo los niveles que muestra la TV (si ninguno tiene sesion, todos: nunca
  // un recorrido vacio por un nivel guardado que hoy no se planifico).
  const delPar = classDay.sessions.filter((s) =>
    niveles.includes(s.memberLevel),
  );
  const base = delPar.length > 0 ? delPar : classDay.sessions;
  // Sesiones en el orden canonico de niveles del dia: subtitulo estable.
  const sessions = [...base].sort(
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
      title: groupTitle(group.firstTitle),
      subtitle: routes.length > 0 ? routes.join(TITLE_SEPARATOR) : null,
      zonas: zonasDelGrupo(ejercicios, group.roles),
    });
  }

  return { bloques };
}
