/**
 * Filtros compartidos de la página Feedback (FeedbackPage): rango de fechas +
 * sucursal. Los tres tabs (Clases / Profes / Sugerencias) los reciben por prop
 * y cada uno agrega sus filtros locales (toggle de comentarios, keyword).
 */
export interface FeedbackFilters {
  dateFrom: string | null;
  dateTo: string | null;
  branchId: number | null;
}
