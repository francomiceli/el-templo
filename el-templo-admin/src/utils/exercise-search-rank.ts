/**
 * Ranking de relevancia para el buscador de ejercicios del editor de
 * sesiones (feedback de profes: buscar "remo" traía primero ejercicios que
 * sólo contienen esas letras en el medio de otra palabra, tipo "Tapiz
 * rodante", porque el filtro era un `includes` puro sin ranking).
 *
 * Mismo criterio que usa la API en `ExerciseSwapService.searchExercises`
 * (`el-templo-api/src/modules/admin/exercise-swap-service.ts`) para la
 * sección "Buscar en base de datos"; acá se aplica client-side sobre el
 * pool ya cargado en memoria (sección "Recomendados").
 *
 * 0: el nombre EMPIEZA con el término
 * 1: alguna PALABRA del nombre empieza con el término
 * 2: substring en cualquier lado del nombre
 * null: no matchea
 */
export function rankExerciseNameMatch(name: string, term: string): number | null {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) return null;

  const normalizedName = name.trim().toLowerCase();

  if (normalizedName.startsWith(normalizedTerm)) return 0;
  if (normalizedName.includes(` ${normalizedTerm}`)) return 1;
  if (normalizedName.includes(normalizedTerm)) return 2;
  return null;
}

/**
 * Filtra una lista por relevancia respecto de un término de búsqueda y la
 * ordena por rank (prefijo > inicio de palabra > substring), desempatando
 * alfabéticamente. Los ítems que no matchean quedan afuera. Si el término
 * está vacío, devuelve la lista sin tocar.
 */
export function filterAndSortByRelevance<T>(
  items: readonly T[],
  term: string,
  getName: (item: T) => string
): T[] {
  if (!term.trim()) return [...items];

  const ranked: Array<{ item: T; rank: number }> = [];
  for (const item of items) {
    const rank = rankExerciseNameMatch(getName(item), term);
    if (rank !== null) ranked.push({ item, rank });
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return getName(a.item).localeCompare(getName(b.item));
  });

  return ranked.map((entry) => entry.item);
}
