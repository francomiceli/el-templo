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
   * true cuando el socio todavía no envió ninguna propuesta en la campaña
   * vigente. La cadencia de re-prompt (7 días) es responsabilidad del
   * cliente; este flag solo dice "ya participó o no".
   */
  shouldPrompt: boolean;
  /**
   * Versión de campaña vigente. Subirla (constante en el service, sale con
   * un deploy de API, sin release del app) relanza el popup a todos los que
   * no participaron de la nueva campaña.
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
