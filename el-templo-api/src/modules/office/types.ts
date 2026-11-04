/**
 * Tipos del módulo Oficina (Fase 205). Espejan el contrato de la API que el
 * admin consume (`205-CONTEXT.md` <api_contract>): nombres de campos y formas
 * no se cambian sin avisar, el admin se escribe contra ellos.
 */
import type {
  OfficeEventType,
  OfficeTargetKind,
  OfficeTopicOrigin,
  OfficeTopicStatus,
} from "../../db/schema/office";

export type {
  OfficeEventType,
  OfficeTargetKind,
  OfficeTopicOrigin,
  OfficeTopicStatus,
};

export interface OfficePerson {
  id: number;
  firstName: string | null;
  lastName: string | null;
}

export interface OfficeEvent {
  id: number;
  type: OfficeEventType;
  body: string | null;
  payload: Record<string, unknown> | null;
  actor: OfficePerson | null;
  createdAt: string;
}

export interface OfficeTopicLastEvent {
  type: OfficeEventType;
  body: string | null;
  actorFirstName: string | null;
  createdAt: string;
}

export interface OfficeTopicListItem {
  id: number;
  title: string;
  status: OfficeTopicStatus;
  origin: OfficeTopicOrigin;
  targetKind: OfficeTargetKind | null;
  targetId: number | null;
  targetLabel: string | null;
  branchId: number | null;
  branchName: string | null;
  /** Responsables del tema, ordenados por nombre. */
  assignees: OfficePerson[];
  createdBy: OfficePerson | null;
  snoozedUntil: string | null;
  lastActivityAt: string;
  createdAt: string;
  closedAt: string | null;
  commentCount: number;
  lastEvent: OfficeTopicLastEvent | null;
  unseen: boolean;
}

export interface OfficeTopicDetail extends OfficeTopicListItem {
  body: string | null;
  events: OfficeEvent[];
}

export interface OfficeStaff {
  id: number;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface OfficeBadge {
  count: number;
  mentions: number;
  assigned: number;
}

// ── Inputs ──────────────────────────────────────────────────────────

export type OfficeListView =
  | "abiertos"
  | "mios"
  | "dormidos"
  | "cerrados"
  | "todos";

export interface ListTopicsQuery {
  view?: OfficeListView;
  origin?: OfficeTopicOrigin;
  q?: string;
  targetKind?: OfficeTargetKind;
  targetId?: number;
  limit?: number;
}

export interface CreateTopicInput {
  title: string;
  body?: string | null;
  targetKind?: OfficeTargetKind | null;
  targetId?: number | null;
  targetLabel?: string | null;
  branchId?: number | null;
  assigneeIds?: number[];
  mentionUserIds?: number[];
}

/** Lo que el job (plan 03) pasa para abrir un tema del sistema. */
export interface CreateSystemTopicInput {
  sourceKey: string;
  title: string;
  body: string | null;
  targetKind: OfficeTargetKind | null;
  targetId: number | null;
  targetLabel: string | null;
  branchId: number | null;
}

export interface PatchTopicInput {
  title?: string;
  body?: string | null;
  /** REEMPLAZA el conjunto completo de responsables (`[]` = sin responsables). */
  assigneeIds?: number[];
  status?: "abierto" | "cerrado";
  snoozedUntil?: string | null;
  note?: string | null;
}

export interface OfficeSystemTopicRef {
  id: number;
  sourceKey: string;
}
