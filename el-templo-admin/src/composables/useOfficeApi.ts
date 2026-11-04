/**
 * Oficina API composable (fase 205) — central de temas de gestión.
 * Contrato: `el-templo-api/src/modules/office/types.ts` (prefijo `/api/admin/office`).
 */
import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { OFICINA_ROLES } from 'src/config/templo-config';
import { extractError } from 'src/utils/extract-error';

export type OfficeTopicStatus = 'abierto' | 'dormido' | 'cerrado';
export type OfficeTopicOrigin = 'manual' | 'sistema';
export type OfficeTargetKind =
  | 'socio'
  | 'jornada'
  | 'wellhub_evento'
  | 'horario'
  | 'caja'
  | 'sede'
  | 'tablero';
export type OfficeEventType =
  | 'creado'
  | 'comentario'
  | 'asignado'
  | 'tomado'
  | 'desasignado'
  | 'dormido'
  | 'cerrado'
  | 'reabierto'
  | 'editado'
  | 'sistema';

export interface OfficePerson {
  id: number;
  firstName: string | null;
  lastName: string | null;
}

export interface OfficeEvent {
  id: number;
  type: OfficeEventType;
  body: string | null;
  /**
   * asignado/tomado/desasignado `{ assigneeIds, assigneeNames }` (los agregados o los quitados),
   * dormido `{ until }`, editado `{ fields }`, reabierto automático `{ auto: true }`.
   */
  payload: Record<string, unknown> | null;
  /** null = el sistema. */
  actor: OfficePerson | null;
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
  lastEvent: {
    type: OfficeEventType;
    body: string | null;
    actorFirstName: string | null;
    createdAt: string;
  } | null;
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

export type OfficeListView = 'abiertos' | 'mios' | 'dormidos' | 'cerrados' | 'todos';

export interface ListTopicsParams {
  view?: OfficeListView;
  origin?: OfficeTopicOrigin;
  q?: string;
  targetKind?: OfficeTargetKind;
  targetId?: number;
  limit?: number;
}

/** El alta manual solo vincula socios (la API rechaza otros `targetKind`). */
export interface CreateTopicInput {
  title: string;
  body?: string | null;
  targetKind?: 'socio' | null;
  targetId?: number | null;
  targetLabel?: string | null;
  branchId?: number | null;
  assigneeIds?: number[];
  mentionUserIds?: number[];
}

export interface PatchTopicInput {
  title?: string;
  body?: string | null;
  /** REEMPLAZA el conjunto completo de responsables (`[]` = sin responsables). */
  assigneeIds?: number[];
  status?: 'abierto' | 'cerrado';
  snoozedUntil?: string | null;
  note?: string | null;
}

export function useOfficeApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listTopics(params: ListTopicsParams = {}): Promise<OfficeTopicListItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const query: Record<string, string | number> = {};
      if (params.view) query.view = params.view;
      if (params.origin) query.origin = params.origin;
      if (params.q) query.q = params.q;
      if (params.targetKind) query.targetKind = params.targetKind;
      if (params.targetId !== undefined) query.targetId = params.targetId;
      if (params.limit !== undefined) query.limit = params.limit;
      const { data } = await api.get<{ topics: OfficeTopicListItem[] }>('/admin/office/topics', {
        params: query,
      });
      return data.topics;
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos cargar los temas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getTopic(id: number): Promise<OfficeTopicDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ topic: OfficeTopicDetail }>(`/admin/office/topics/${id}`);
      return data.topic;
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos cargar el tema');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createTopic(input: CreateTopicInput): Promise<OfficeTopicDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ topic: OfficeTopicDetail }>('/admin/office/topics', input);
      return data.topic;
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos crear el tema');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function patchTopic(id: number, input: PatchTopicInput): Promise<OfficeTopicDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<{ topic: OfficeTopicDetail }>(
        `/admin/office/topics/${id}`,
        input
      );
      return data.topic;
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos actualizar el tema');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function addComment(
    id: number,
    body: string,
    mentionUserIds: number[] = []
  ): Promise<OfficeTopicDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ topic: OfficeTopicDetail }>(
        `/admin/office/topics/${id}/comments`,
        { body, mentionUserIds }
      );
      return data.topic;
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos publicar el comentario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Marca el tema como visto (y mis menciones como leídas). 204 sin cuerpo. */
  async function markSeen(id: number): Promise<void> {
    try {
      await api.post(`/admin/office/topics/${id}/seen`);
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos marcar el tema como visto');
      throw err;
    }
  }

  async function fetchBadge(): Promise<OfficeBadge> {
    try {
      const { data } = await api.get<OfficeBadge>('/admin/office/badge');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos cargar el contador de Oficina');
      throw err;
    }
  }

  async function listStaff(): Promise<OfficeStaff[]> {
    try {
      const { data } = await api.get<{ staff: OfficeStaff[] }>('/admin/office/staff');
      // El API ya devuelve solo owner/admin; el filtro por OFICINA_ROLES es la misma
      // regla del lado del admin (responsables y @menciones).
      return data.staff.filter((person) => (OFICINA_ROLES as string[]).includes(person.role));
    } catch (err: unknown) {
      error.value = extractError(err, 'No pudimos cargar el equipo');
      throw err;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    listTopics,
    getTopic,
    createTopic,
    patchTopic,
    addComment,
    markSeen,
    fetchBadge,
    listStaff,
    cleanup,
  };
}
