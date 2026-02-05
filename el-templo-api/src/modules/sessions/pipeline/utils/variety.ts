/**
 * Exercise Variety Utilities
 *
 * Functions for selecting exercises with variety across sessions.
 * Used to ensure different days/weeks get different exercise combinations.
 */

/** Map day name to index for deterministic variety */
function dayToIndex(day: string): number {
  const days: Record<string, number> = {
    'lunes': 0, 'martes': 1, 'miercoles': 2,
    'jueves': 3, 'viernes': 4, 'sabado': 5,
  };
  return days[day.toLowerCase()] ?? 0;
}

/**
 * Calculate exercise pool offset for variety across sessions.
 * Same week+day always produces same offset (deterministic).
 * Different week or day produces different exercises.
 *
 * Uses larger prime multipliers to ensure better spread even with small pools.
 * The dayIndex is given higher weight (x13) to ensure adjacent days differ significantly.
 */
export function calculateExerciseOffset(week: number, day: string): number {
  const dayIndex = dayToIndex(day);
  // Use larger prime multipliers for better distribution across small pools
  // dayIndex * 13 ensures adjacent days have significant offset differences
  // week * 7 provides week-to-week variation
  return (week * 7 + dayIndex * 13);
}

/**
 * Select exercises from pool with variety based on offset.
 * Uses stride-based selection to ensure different days get different combinations
 * even when pools are small.
 *
 * @param pool - Available exercises to select from (must have id property)
 * @param count - Number of exercises to select
 * @param offset - Offset to determine starting position (from calculateExerciseOffset)
 * @returns Selected exercises
 */
export function selectWithVariety<T extends { id: number }>(
  pool: readonly T[],
  count: number,
  offset: number
): T[] {
  if (pool.length === 0) return [];
  if (pool.length <= count) {
    // Not enough exercises for variety - return all available
    return [...pool].slice(0, count);
  }

  // Use offset to determine starting position
  const start = offset % pool.length;

  // Calculate stride to spread selections across the pool
  // Use a prime-ish stride that doesn't divide evenly into pool.length
  const stride = pool.length > count
    ? Math.max(1, Math.floor(pool.length / count))
    : 1;

  const selected: T[] = [];
  const usedIndices = new Set<number>();

  // First pass: select with stride
  for (let i = 0; i < count && selected.length < count; i++) {
    const idx = (start + i * stride) % pool.length;
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      selected.push(pool[idx]);
    }
  }

  // Fill any gaps (due to stride collision) with unused exercises
  if (selected.length < count) {
    for (let i = 0; i < pool.length && selected.length < count; i++) {
      const idx = (start + i) % pool.length;
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx);
        selected.push(pool[idx]);
      }
    }
  }

  return selected;
}
