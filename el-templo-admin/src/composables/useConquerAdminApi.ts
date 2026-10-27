/**
 * Fase 201 (Conquer v2): cliente tipado de TODAS las rutas de `/api/admin/conquer`.
 *
 * Los tipos espejan los schemas de respuesta del API (`src/types/conquer.ts`). El gate real
 * (D-08: solo owner y admin) vive en el API; el menú y la ruta solo ocultan. Cada función
 * lanza un `ConquerApiError` cuyo `message` es el `error` en español que manda el API (los
 * 409/400 de negocio traen además `code` `CONQUER_*`), listo para un Notify.
 *
 * Nunca se loguean URLs firmadas, claves de foto ni medidas: solo `{ checkId, pose }`.
 */

import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';
import type {
  ActivateBody,
  AdminCatalog,
  AdminLadder,
  AdminMemberView,
  AdminExercise,
  AdminTemplateDay,
  AdminTutorials,
  AlertPatchBody,
  BoardAlert,
  BoardResponse,
  BodyChecksResponse,
  ChangeStepBody,
  ConquerSettingsPatch,
  ConquerSettingsResponse,
  CreateRungBody,
  CutBody,
  FichaResponse,
  GalleryResponse,
  LevelUpBody,
  PhotoUrlResponse,
  Pose,
  StepKey,
  TutorialTargetInput,
  TutorialUploadUrl,
  UnlockRequest,
  UnlockRequestsResponse,
  UpdateExerciseBody,
  UpdateMemberBody,
  UpdateRungBody,
  UpdateTemplateDayBody,
} from 'src/types/conquer';

const log = createLogger('useConquerAdminApi');

const BASE = '/admin/conquer';

/** Error del API de Conquer: `message` en español; `code` (`CONQUER_*`) solo en los de negocio. */
export class ConquerApiError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null, status: number | null) {
    super(message);
    this.name = 'ConquerApiError';
    this.code = code;
    this.status = status;
  }
}

/** Del error de axios al `ConquerApiError`: prioriza el `error` del API, que ya viene en español. */
export function toConquerError(err: unknown, fallback: string): ConquerApiError {
  if (err instanceof ConquerApiError) return err;
  if (axios.isAxiosError(err)) {
    const data: unknown = err.response?.data;
    const status = err.response?.status ?? null;
    if (data !== null && typeof data === 'object') {
      const body = data as { error?: unknown; code?: unknown };
      const code = typeof body.code === 'string' ? body.code : null;
      if (typeof body.error === 'string' && body.error.length > 0) {
        return new ConquerApiError(body.error, code, status);
      }
      return new ConquerApiError(extractError(err, fallback), code, status);
    }
    return new ConquerApiError(extractError(err, fallback), null, status);
  }
  return new ConquerApiError(extractError(err, fallback), null, null);
}

/** Corre una llamada y normaliza el error. `context` va al log (sin datos sensibles). */
async function call<T>(
  context: string,
  fallback: string,
  fn: () => Promise<T>,
  meta: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const conquerError = toConquerError(err, fallback);
    // Los 4xx son errores de negocio esperados (409, 400, 404): warn, sin ruido en Sentry.
    const logFn = isExpectedClientError(err) ? log.warn : log.error;
    logFn(`${context} failed`, { ...meta, error: conquerError.message });
    throw conquerError;
  }
}

export function useConquerAdminApi() {
  // ── Pedidos y alta ────────────────────────────────────────────────

  async function listRequests(): Promise<UnlockRequest[]> {
    return call('listRequests', 'No pudimos cargar los pedidos de desbloqueo', async () => {
      const { data } = await api.get<UnlockRequestsResponse>(`${BASE}/requests`);
      return data.requests;
    });
  }

  async function countRequests(): Promise<number> {
    return call('countRequests', 'No pudimos contar los pedidos', async () => {
      const { data } = await api.get<{ count: number }>(`${BASE}/requests/count`);
      return data.count;
    });
  }

  async function activate(body: ActivateBody): Promise<AdminMemberView> {
    return call('activate', 'No pudimos activar a este alumno', async () => {
      const { data } = await api.post<AdminMemberView>(`${BASE}/members`, body);
      return data;
    });
  }

  async function updateMember(userId: number, patch: UpdateMemberBody): Promise<AdminMemberView> {
    return call(
      'updateMember',
      'No pudimos guardar los cambios del alumno',
      async () => {
        const { data } = await api.put<AdminMemberView>(`${BASE}/members/${userId}`, patch);
        return data;
      },
      { userId }
    );
  }

  // ── Tablero y alertas ─────────────────────────────────────────────

  async function getBoard(): Promise<BoardResponse> {
    return call('getBoard', 'No pudimos cargar el tablero', async () => {
      const { data } = await api.get<BoardResponse>(`${BASE}/members`);
      return data;
    });
  }

  async function patchAlert(id: number, status: AlertPatchBody['status']): Promise<BoardAlert> {
    return call(
      'patchAlert',
      'No pudimos actualizar la alerta',
      async () => {
        const body: AlertPatchBody = { status };
        const { data } = await api.patch<BoardAlert>(`${BASE}/alerts/${id}`, body);
        return data;
      },
      { alertId: id }
    );
  }

  // ── Ficha y acciones del coach (devuelven la ficha completa) ──────

  async function getFicha(userId: number): Promise<FichaResponse> {
    return call(
      'getFicha',
      'No pudimos cargar la ficha del alumno',
      async () => {
        const { data } = await api.get<FichaResponse>(`${BASE}/members/${userId}`);
        return data;
      },
      { userId }
    );
  }

  async function changeStep(
    userId: number,
    exerciseId: number,
    step: StepKey,
    body: ChangeStepBody
  ): Promise<FichaResponse> {
    return call(
      'changeStep',
      'No pudimos corregir la progresión',
      async () => {
        const { data } = await api.put<FichaResponse>(
          `${BASE}/members/${userId}/steps/${exerciseId}/${step}`,
          body
        );
        return data;
      },
      { userId, exerciseId, step }
    );
  }

  async function applyCut(userId: number, body: CutBody): Promise<FichaResponse> {
    return call(
      'applyCut',
      'No pudimos aplicar el recorte',
      async () => {
        const { data } = await api.post<FichaResponse>(`${BASE}/members/${userId}/recortes`, body);
        return data;
      },
      { userId, action: body.action }
    );
  }

  async function levelUp(userId: number, body: LevelUpBody): Promise<FichaResponse> {
    return call(
      'levelUp',
      'No pudimos confirmar el paso de nivel',
      async () => {
        const { data } = await api.post<FichaResponse>(`${BASE}/members/${userId}/level-up`, body);
        return data;
      },
      { userId }
    );
  }

  // ── Control físico y galería ──────────────────────────────────────

  async function getMemberBodyChecks(userId: number): Promise<BodyChecksResponse> {
    return call(
      'getMemberBodyChecks',
      'No pudimos cargar los controles del alumno',
      async () => {
        const { data } = await api.get<BodyChecksResponse>(`${BASE}/members/${userId}/body-checks`);
        return data;
      },
      { userId }
    );
  }

  /** URL firmada de 5 minutos. Se pide al abrir la foto y NO se cachea ni se loguea. */
  async function getMemberPhotoUrl(
    userId: number,
    checkId: number,
    pose: Pose
  ): Promise<PhotoUrlResponse> {
    return call(
      'getMemberPhotoUrl',
      'No pudimos cargar la foto',
      async () => {
        const { data } = await api.get<PhotoUrlResponse>(
          `${BASE}/members/${userId}/body-checks/${checkId}/photos/${pose}/url`
        );
        return data;
      },
      { checkId, pose }
    );
  }

  /** `authorized`: `true` = solo con permiso de publicar, `false` = sin permiso, ausente = todos. */
  async function getGallery(authorized?: boolean): Promise<GalleryResponse> {
    return call('getGallery', 'No pudimos cargar la galería', async () => {
      const { data } = await api.get<GalleryResponse>(`${BASE}/gallery`, {
        params: authorized === undefined ? {} : { authorized },
      });
      return data;
    });
  }

  // ── Catálogo y parámetros (cada mutación devuelve la vista actualizada) ──

  async function getCatalog(): Promise<AdminCatalog> {
    return call('getCatalog', 'No pudimos cargar el catálogo', async () => {
      const { data } = await api.get<AdminCatalog>(`${BASE}/catalog`);
      return data;
    });
  }

  async function createRung(ladderId: number, body: CreateRungBody): Promise<AdminLadder> {
    return call(
      'createRung',
      'No pudimos agregar el peldaño',
      async () => {
        const { data } = await api.post<AdminLadder>(`${BASE}/ladders/${ladderId}/rungs`, body);
        return data;
      },
      { ladderId }
    );
  }

  async function updateRung(rungId: number, body: UpdateRungBody): Promise<AdminLadder> {
    return call(
      'updateRung',
      'No pudimos guardar el peldaño',
      async () => {
        const { data } = await api.put<AdminLadder>(`${BASE}/rungs/${rungId}`, body);
        return data;
      },
      { rungId }
    );
  }

  /** Manda TODOS los ids de la escalera (también los desactivados), del más difícil al más fácil. */
  async function reorderRungs(ladderId: number, rungIds: number[]): Promise<AdminLadder> {
    return call(
      'reorderRungs',
      'No pudimos reordenar los peldaños',
      async () => {
        const { data } = await api.put<AdminLadder>(`${BASE}/ladders/${ladderId}/order`, {
          rungIds,
        });
        return data;
      },
      { ladderId }
    );
  }

  async function updateExercise(
    exerciseId: number,
    body: UpdateExerciseBody
  ): Promise<AdminExercise> {
    return call(
      'updateExercise',
      'No pudimos guardar el ejercicio',
      async () => {
        const { data } = await api.put<AdminExercise>(`${BASE}/exercises/${exerciseId}`, body);
        return data;
      },
      { exerciseId }
    );
  }

  async function updateTemplateDay(
    id: number,
    body: UpdateTemplateDayBody
  ): Promise<AdminTemplateDay> {
    return call(
      'updateTemplateDay',
      'No pudimos guardar el día de la plantilla',
      async () => {
        const { data } = await api.put<AdminTemplateDay>(`${BASE}/template-days/${id}`, body);
        return data;
      },
      { templateDayId: id }
    );
  }

  async function getSettings(): Promise<ConquerSettingsResponse> {
    return call('getSettings', 'No pudimos cargar los parámetros', async () => {
      const { data } = await api.get<ConquerSettingsResponse>(`${BASE}/settings`);
      return data;
    });
  }

  async function saveSettings(patch: ConquerSettingsPatch): Promise<ConquerSettingsResponse> {
    return call('saveSettings', 'No pudimos guardar los parámetros', async () => {
      const { data } = await api.put<ConquerSettingsResponse>(`${BASE}/settings`, patch);
      return data;
    });
  }

  // ── Tutoriales en video (fase 202, D-25): PUT y DELETE devuelven la vista completa ──

  async function getTutorials(): Promise<AdminTutorials> {
    return call('getTutorials', 'No pudimos cargar los tutoriales', async () => {
      const { data } = await api.get<AdminTutorials>(`${BASE}/tutorials`);
      return data;
    });
  }

  /** Pide la URL firmada para subir el MP4. `contentType` tiene que ser `video/mp4`. */
  async function requestTutorialUpload(
    input: TutorialTargetInput,
    contentType: string
  ): Promise<TutorialUploadUrl> {
    return call(
      'requestTutorialUpload',
      'No pudimos preparar la subida del tutorial',
      async () => {
        const { data } = await api.post<TutorialUploadUrl>(`${BASE}/tutorials/upload-url`, {
          ...input,
          contentType,
        });
        return data;
      },
      { target: input.target }
    );
  }

  /** Confirma el video ya subido con la clave que devolvió `requestTutorialUpload`. */
  async function confirmTutorial(input: TutorialTargetInput, key: string): Promise<AdminTutorials> {
    return call(
      'confirmTutorial',
      'No pudimos guardar el tutorial',
      async () => {
        const { data } = await api.put<AdminTutorials>(`${BASE}/tutorials`, { ...input, key });
        return data;
      },
      { target: input.target }
    );
  }

  async function deleteTutorial(input: TutorialTargetInput): Promise<AdminTutorials> {
    const path =
      input.target === 'ejercicio'
        ? `${BASE}/tutorials/exercise/${input.exerciseId}`
        : `${BASE}/tutorials/combo/${input.comboKey}`;
    return call(
      'deleteTutorial',
      'No pudimos borrar el tutorial',
      async () => {
        const { data } = await api.delete<AdminTutorials>(path);
        return data;
      },
      { target: input.target }
    );
  }

  return {
    listRequests,
    countRequests,
    activate,
    updateMember,
    getBoard,
    patchAlert,
    getFicha,
    changeStep,
    applyCut,
    levelUp,
    getMemberBodyChecks,
    getMemberPhotoUrl,
    getGallery,
    getCatalog,
    createRung,
    updateRung,
    reorderRungs,
    updateExercise,
    updateTemplateDay,
    getSettings,
    saveSettings,
    getTutorials,
    requestTutorialUpload,
    confirmTutorial,
    deleteTutorial,
  };
}
