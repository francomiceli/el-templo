/**
 * Improvement proposals module — public types.
 *
 * Dos flujos desacoplados:
 *  1. Member: prompt-status (¿mostrar el popup?) + submit (texto libre, la
 *     sucursal se resuelve server-side desde users.branch_id).
 *  2. Admin: listado paginado con filtros (fechas, sucursal, keyword) + export
 *     xlsx con los mismos filtros. Solo MEMBER_LIFECYCLE_ROLES.
 */

/** Estado del popup de propuestas para el socio autenticado. */
export interface ProposalPromptStatus {
  /**
   * true cuando el socio no envió ninguna propuesta en los últimos 30 días
   * (recurrencia mensual del popup). La cadencia de re-prompt tras "Ahora
   * no" (14 días) es responsabilidad del cliente; este flag solo dice si
   * está dentro del silencio post-envío.
   */
  shouldPrompt: boolean;
  /**
   * Versión de campaña vigente: versiona la key de storage local del app.
   * Subirla (constante en el service, sale con un deploy de API, sin
   * release del app) fuerza un re-show inmediato.
   */
  campaign: number;
}

export interface SubmitProposalInput {
  proposal: string;
}

export interface AdminProposalsFilters {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  /** Búsqueda por palabra clave sobre el texto de la propuesta (LIKE). */
  q?: string;
  page?: number;
  limit?: number;
}

export interface AdminProposalRow {
  id: number;
  memberName: string;
  branchName: string;
  proposal: string;
  createdAt: string;
}

export interface AdminProposalsResult {
  rows: AdminProposalRow[];
  total: number;
  page: number;
  limit: number;
}

/** Scope de país del staff (espejo de RatingsScope). */
export interface ProposalsScope {
  isOwner: boolean;
  country: string | null;
}
