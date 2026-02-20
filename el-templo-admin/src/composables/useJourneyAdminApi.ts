import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import type {
  JourneyType,
  JourneyGenerateResult,
  MemberJourneyInfo,
  MemberJourneyDetail,
} from 'src/types/journey';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useJourneyAdminApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function generateJourneySessions(
    week: number,
    journeyType: JourneyType,
    options?: { days?: string[]; regenerate?: boolean }
  ): Promise<JourneyGenerateResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<JourneyGenerateResult>(
        '/admin/journeys/generate',
        {
          week,
          journeyType,
          days: options?.days,
          regenerate: options?.regenerate,
        },
        {
          timeout: 120_000, // 2 min — generation is slow
        }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error generando sesiones de journey');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMembers(params?: {
    search?: string;
    journeyType?: string;
    page?: number;
    limit?: number;
  }): Promise<{ members: MemberJourneyInfo[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ members: MemberJourneyInfo[]; total: number }>(
        '/admin/journeys/members',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMemberDetail(userId: number): Promise<MemberJourneyDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberJourneyDetail>(`/admin/journeys/members/${userId}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando detalle de miembro');
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
    generateJourneySessions,
    getMembers,
    getMemberDetail,
    cleanup,
  };
}
