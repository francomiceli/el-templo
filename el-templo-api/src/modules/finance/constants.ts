// Module: finance — phase 141 (reportes para la admin)
//
// Shared finance report constants.

/**
 * Phase 141 (D-08 / REP-01): umbral de antigüedad para marcar un pendiente como
 * "vencido". Un pendiente con `ageInDays > OVERDUE_DAYS` dispara la alerta de la
 * bandeja (color/badge + contador). Computado server-side para que el contador
 * de vencidos sea autoritativo.
 *
 * HARD-CODED en 141 a 3 días (default). **Phase 142 (config) reemplaza este
 * literal por una lectura de `finance_settings`** (la 136-07 borró el subsistema
 * de settings; la 142 lo reconstruye). El endpoint devuelve `thresholdDays` en
 * el payload para que la UI use el mismo número sin tocarse cuando 142 lo cambie.
 */
export const OVERDUE_DAYS = 3;
