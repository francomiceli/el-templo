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
  proposedSubfamily: string | null;
  proposedLeverage: string | null;
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
  proposedSubfamily?: string;
  proposedLeverage?: string | null;
  proposedRoute?: string;
}

export interface BulkAcceptResponse {
  success: boolean;
  acceptedCount: number;
}
