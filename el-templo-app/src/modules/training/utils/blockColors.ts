import type { BlockRole } from '../types/session';

/**
 * Get color class based on block role
 */
export function getBlockColorClass(role: BlockRole): string {
  const colorMap: Record<BlockRole, string> = {
    INITIUM: 'bg-light-blue-1',
    NUCLEUS: 'bg-purple-1',
    DEUTEROS_1: 'bg-cyan-1',
    DEUTEROS_2: 'bg-deep-purple-1',
    ATHLOS_EPIKOS: 'bg-amber-1',
  };
  return colorMap[role] || 'bg-grey-1';
}
