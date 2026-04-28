/**
 * Shared types used across multiple modules.
 */

/**
 * Standard paginated response shape. Callers MUST set `rows`, `total`,
 * `page`, and `limit`. Originally lived in modules/reports/types.ts;
 * relocated to shared/ in Phase 106 because finance/ became a second consumer.
 */
export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}
