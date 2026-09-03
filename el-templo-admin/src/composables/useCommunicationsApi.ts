/**
 * Communications API composable (Fase 193, plan 08).
 *
 * Wrapper delgado sobre DOS módulos del backend consumidos desde la sección
 * "Comunicaciones" del admin:
 *  - `/api/communications/admin/*` (avisos de la app, número de ventas —
 *    `el-templo-api/src/modules/communications/routes.ts`, plan 04). Los usan
 *    los planes 11 (Avisos) y 14 (Tarjetas + Ajustes); este plan 08 los deja
 *    listos aunque la pestaña Push todavía no los llame.
 *  - `/api/notifications/admin/*` (plantillas push, envío a segmento —
 *    `el-templo-api/src/modules/notifications/routes.ts`, plan 06). Los usa
 *    `PushTab.vue`.
 *
 * Mismo patrón que `useTvApi.ts`: refs `loading`/`error`, `api` de
 * `boot/axios`, `extractError` para los mensajes, `cleanup()` sin
 * `onUnmounted` (el llamador es dueño del ciclo de vida, CLAUDE.md).
 *
 * Los tipos de acá son la copia manual del contrato del API (sin paquete
 * compartido entre apps, mismo criterio que `src/config/destinations.ts`).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { AppSectionKey, Destination } from 'src/config/destinations';
import type {
  NotificationCategoryKey,
  RuleTriggerType,
} from 'src/config/rule-triggers';

// ── Avisos (el-templo-api/src/modules/communications/schemas.ts) ──────────

export type AvisoKind = 'system' | 'custom';
export type AvisoPlacement = 'popup' | 'tarjeta';
export type AvisoFrequencyType = 'once' | 'every_n_days' | 'every_open';
export type AvisoStatus = 'draft' | 'active' | 'paused';
export type MemberSegmentKey = 'optima' | 'regular' | 'alerta' | 'ausente';

export interface AvisoRow {
  id: number;
  kind: AvisoKind;
  code: string | null;
  placement: AvisoPlacement;
  title: string;
  body: string;
  buttonText: string;
  destinationType: Destination['type'];
  destinationSection: AppSectionKey | null;
  whatsappText: string | null;
  frequencyType: AvisoFrequencyType;
  frequencyDays: number | null;
  status: AvisoStatus;
  startsOn: string | null;
  endsOn: string | null;
  scopeBranchIds: number[] | null;
  scopeCountries: string[] | null;
  scopeSegments: MemberSegmentKey[] | null;
  sortOrder: number;
  reachedCount: number;
  dismissedCount: number;
  clickedCount: number;
}

export interface CreateAvisoInput {
  placement: AvisoPlacement;
  title: string;
  body: string;
  buttonText: string;
  destinationType: Destination['type'];
  destinationSection?: AppSectionKey | null;
  whatsappText?: string | null;
  frequencyType: AvisoFrequencyType;
  frequencyDays?: number | null;
  status?: AvisoStatus;
  startsOn?: string | null;
  endsOn?: string | null;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  scopeSegments?: MemberSegmentKey[] | null;
  sortOrder?: number;
}

export type UpdateAvisoInput = Partial<CreateAvisoInput>;

export interface AvisoClicker {
  userId: number;
  fullName: string;
  phone: string | null;
  lastAt: string;
}

export interface SalesNumbers {
  AR: string | null;
  ES: string | null;
}

/**
 * Body de `PUT /admin/sales-number` (`UpdateSalesNumberBody`,
 * el-templo-api/src/modules/communications/schemas.ts): ambos campos
 * OPCIONALES y, si vienen, `string` puro (patrón `^[0-9]{8,15}$`) — el
 * schema del server NO acepta `null`. Un país ausente del body no se toca
 * (`service.setSalesNumbers` solo escribe los campos `!== undefined`).
 */
export interface UpdateSalesNumbersInput {
  AR?: string;
  ES?: string;
}

// ── Plantillas push (el-templo-api/src/modules/notifications/routes.ts) ───

// Fase 193, Plan B (pedido de Franco 2026-09-03): homogeneidad sistema/propias
// + reglas recetadas — campos nuevos que agregó el Plan A en
// `el-templo-api/src/modules/notifications/routes.ts` (GET/PUT/POST
// /admin/templates). `kind` distingue el origen; el resto solo aplica de
// verdad a `kind: 'custom'` (en `kind: 'system'` viajan `null`/default).
export type TemplateKind = 'system' | 'custom';

export interface TemplateRow {
  id: number;
  templateKey: string;
  kind: TemplateKind;
  name: string | null;
  category: string;
  title: string;
  body: string;
  titleFemale: string | null;
  bodyFemale: string | null;
  route: string;
  destinationType: Destination['type'];
  destinationSection: AppSectionKey | null;
  whatsappText: string | null;
  isEnabled: boolean;
  sentCount: number;
  openedCount: number;
  openRate: number;
  triggerType: RuleTriggerType | null;
  triggerValue: number | null;
  triggerSegment: MemberSegmentKey | null;
  scopeBranchIds: number[] | null;
  scopeCountries: string[] | null;
  cooldownDays: number;
}

export interface UpdateTemplateInput {
  title?: string;
  body?: string;
  titleFemale?: string;
  bodyFemale?: string;
  destination?: Destination;
  isEnabled?: boolean;
  // Solo aplican a `kind: 'custom'` — el server rechaza con 400 si vienen
  // para un template de sistema (ver docblock de PUT en routes.ts).
  name?: string;
  triggerType?: RuleTriggerType;
  triggerValue?: number;
  triggerSegment?: MemberSegmentKey;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  cooldownDays?: number;
}

export interface CreateTemplateInput {
  name: string;
  category: NotificationCategoryKey;
  title: string;
  body: string;
  titleFemale?: string;
  bodyFemale?: string;
  destination: Destination;
  triggerType: RuleTriggerType;
  triggerValue?: number;
  triggerSegment?: MemberSegmentKey;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  cooldownDays?: number;
  isEnabled?: boolean;
}

/** Body de `POST /admin/templates/preview-audience` — sin textos, mismo
 * shape de condición que create/update. */
export interface PreviewTemplateAudienceInput {
  triggerType: RuleTriggerType;
  triggerValue?: number;
  triggerSegment?: MemberSegmentKey;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
}

export interface RestoreSystemResult {
  restored: number;
  keys: string[];
}

export interface SendSegmentInput {
  title: string;
  body: string;
  titleFemale?: string;
  bodyFemale?: string;
  segmentIds: MemberSegmentKey[];
  destination: Destination;
}

// ── Avisos de TV (el-templo-api/src/modules/communications/tv-avisos-service.ts) ──
// Entidad APARTE de los avisos de app: sin destino/alcance-país-segmento/vigencia/
// frecuencia (D-24). Gateada por el módulo `templo-training` (D-23) — un 404 en
// cualquiera de estas 4 rutas significa "módulo apagado para este tenant", no un
// error real (ver TvAvisosTab.vue).

export type TvAvisoMode = 'manual' | 'flex_inicio' | 'flex_final';

export interface TvAvisoRow {
  id: number;
  title: string;
  body: string;
  mode: TvAvisoMode;
  isActive: boolean;
  scopeBranchIds: number[] | null;
}

export interface CreateTvAvisoInput {
  title: string;
  body: string;
  mode: TvAvisoMode;
  isActive?: boolean;
  scopeBranchIds?: number[] | null;
}

export type UpdateTvAvisoInput = Partial<CreateTvAvisoInput>;

export function useCommunicationsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // -- Avisos ---------------------------------------------------------------

  async function listAvisos(placement?: AvisoPlacement): Promise<AvisoRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ avisos: AvisoRow[] }>('/communications/admin/avisos', {
        params: placement ? { placement } : undefined,
      });
      return data.avisos;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron cargar los avisos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createAviso(input: CreateAvisoInput): Promise<AvisoRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<AvisoRow>('/communications/admin/avisos', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo crear el aviso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateAviso(id: number, input: UpdateAvisoInput): Promise<AvisoRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<AvisoRow>(`/communications/admin/avisos/${id}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo actualizar el aviso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteAviso(id: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/communications/admin/avisos/${id}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo borrar el aviso');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listAvisoClickers(id: number, limit?: number): Promise<AvisoClicker[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ clickers: AvisoClicker[] }>(
        `/communications/admin/avisos/${id}/clickers`,
        { params: limit ? { limit } : undefined },
      );
      return data.clickers;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar quién tocó el botón');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Número de WhatsApp de ventas (D-20) -----------------------------------

  async function getSalesNumbers(): Promise<SalesNumbers> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SalesNumbers>('/communications/admin/sales-number');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el número de ventas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function setSalesNumbers(input: UpdateSalesNumbersInput): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put('/communications/admin/sales-number', input);
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo guardar el número de ventas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Plantillas de notificación push ---------------------------------------

  async function listTemplates(): Promise<TemplateRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ templates: TemplateRow[] }>(
        '/notifications/admin/templates',
      );
      return data.templates;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron cargar las plantillas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateTemplate(id: number, input: UpdateTemplateInput): Promise<TemplateRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<TemplateRow>(
        `/notifications/admin/templates/${id}`,
        input,
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo actualizar la plantilla');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendSegment(input: SendSegmentInput): Promise<{ queued: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ queued: number }>(
        '/notifications/admin/send-segment',
        input,
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo enviar la notificación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /notifications/admin/templates — crea una notificación propia con
   * condición recetada (Plan B, editor `PushRuleEditorDialog.vue`). Siempre
   * `kind: 'custom'` — `templateKey` lo genera el server.
   */
  async function createTemplate(input: CreateTemplateInput): Promise<TemplateRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<TemplateRow>('/notifications/admin/templates', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo crear la notificación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** DELETE /notifications/admin/templates/:id — borra CUALQUIER kind (homogeneidad). */
  async function deleteTemplate(id: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/notifications/admin/templates/${id}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo borrar la notificación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /notifications/admin/templates/preview-audience — "hoy alcanzaría
   * N socios" del editor de reglas propias. Devuelve solo el número; el
   * caller decide cómo mostrarlo (debounce, loading, etc.).
   */
  async function previewTemplateAudience(input: PreviewTemplateAudienceInput): Promise<number> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ count: number }>(
        '/notifications/admin/templates/preview-audience',
        input,
      );
      return data.count;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo calcular la audiencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /notifications/admin/seed-templates — "Restaurar las del sistema"
   * para notificaciones push. Owner-only en el server (403 para admin) —
   * el caller debe ocultar el botón para roles no-owner.
   */
  async function restoreSystemTemplates(): Promise<RestoreSystemResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<RestoreSystemResult>('/notifications/admin/seed-templates');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron restaurar las plantillas de sistema');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /communications/admin/avisos/restore-system — "Restaurar las del
   * sistema" para avisos Y tarjetas (misma entidad `avisos`, distinguidas
   * por `placement`) — re-siembra los `code` que falten en las dos
   * categorías a la vez.
   */
  async function restoreSystemAvisos(): Promise<RestoreSystemResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<RestoreSystemResult>(
        '/communications/admin/avisos/restore-system',
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron restaurar los avisos de sistema');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Avisos de TV (D-24) ---------------------------------------------------

  async function listTvAvisos(): Promise<TvAvisoRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ avisos: TvAvisoRow[] }>(
        '/communications/tv/admin/tv-avisos',
      );
      return data.avisos;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron cargar los avisos de TV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createTvAviso(input: CreateTvAvisoInput): Promise<TvAvisoRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<TvAvisoRow>(
        '/communications/tv/admin/tv-avisos',
        input,
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo crear el aviso de TV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateTvAviso(id: number, input: UpdateTvAvisoInput): Promise<TvAvisoRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<TvAvisoRow>(
        `/communications/tv/admin/tv-avisos/${id}`,
        input,
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo actualizar el aviso de TV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteTvAviso(id: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/communications/tv/admin/tv-avisos/${id}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo borrar el aviso de TV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    listAvisos,
    createAviso,
    updateAviso,
    deleteAviso,
    listAvisoClickers,
    getSalesNumbers,
    setSalesNumbers,
    listTemplates,
    updateTemplate,
    createTemplate,
    deleteTemplate,
    previewTemplateAudience,
    restoreSystemTemplates,
    restoreSystemAvisos,
    sendSegment,
    listTvAvisos,
    createTvAviso,
    updateTvAviso,
    deleteTvAviso,
    cleanup,
  };
}
