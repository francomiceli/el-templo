// Dimension-proposal review types (Phase 125 — TREE-03 profe review screen).
// Mirrors the API shape from el-templo-api/src/modules/admin/proposal-service.ts
// (ProposalListItem / ListProposalsResult).

export type ProposalStatus = 'pending' | 'accepted' | 'rejected';

export interface Proposal {
  id: number;
  exerciseId: number;
  exerciseName: string;
  /** The exercise's REAL current route (grouping key). */
  currentRoute: string;
  /** True when the exercise has no confirmed route yet (route is writable on accept). */
  routePending: boolean;
  /** Escalón de progresión propuesto (rank dentro de la ruta); null = linear/unknown. */
  proposedStep: number | null;
  /** Habilidad propuesta (variante paralela); null = va en el backbone. */
  proposedHabilidad: string | null;
  proposedRoute: string | null;
  status: ProposalStatus;
  engine: string | null;
  confidence: number | null;
}

export interface ProposalListResponse {
  proposals: Proposal[];
  total: number;
}

export interface ProposalFilters {
  route?: string;
  status?: ProposalStatus;
}

/** Inline-edit overrides a profe can supply when accepting a single proposal (D-07). */
export interface AcceptOverrides {
  /** Escalón; null marca el ejercicio off-backbone (linear/unknown). */
  proposedStep?: number | null;
  /** Habilidad; null pone el ejercicio en el backbone. */
  proposedHabilidad?: string | null;
  proposedRoute?: string;
}

export interface BulkAcceptResponse {
  success: boolean;
  acceptedCount: number;
}

/** Per-route progression model from GET /admin/exercises/route-progression-map. */
export type RouteStrategy = 'token' | 'linear' | 'excluded';

export interface RouteReviewInfo {
  strategy: RouteStrategy;
  /** Ordered step tokens (easy→hard); empty for linear/excluded routes. */
  steps: string[];
  /** Non-default Habilidad variant tokens. */
  habilidades: string[];
}

/** route code → its progression info. */
export type RouteProgressionMap = Record<string, RouteReviewInfo>;
