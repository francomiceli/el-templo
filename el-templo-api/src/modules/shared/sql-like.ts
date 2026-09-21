/**
 * Escapa los metacaracteres de LIKE (`%`, `_`, `\`) para que un término de
 * búsqueda provisto por el usuario se trate como texto literal en un
 * patrón `LIKE`. MySQL usa `\` como escape char por defecto, así que no
 * hace falta una cláusula `ESCAPE` explícita.
 *
 * Mismo patrón que `escapeLike` en `modules/improvement-proposals/service.ts`;
 * vive acá para que otros call sites (ej. búsqueda de ejercicios) lo reusen
 * sin duplicar la regex.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
