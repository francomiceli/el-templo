import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  PersonalizadaType,
  PersonalizadaGenerateResult,
  MemberPersonalizadaInfo,
  MemberPersonalizadaDetail,
} from 'src/types/personalizada';

export function usePersonalizadasAdminApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function generatePersonalizadaSessions(
    week: number,
    personalizadaType: PersonalizadaType,
    options?: { days?: string[]; regenerate?: boolean }
  ): Promise<PersonalizadaGenerateResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<PersonalizadaGenerateResult>(
        '/admin/personalizadas/generate',
        {
          week,
          personalizadaType,
          days: options?.days,
          regenerate: options?.regenerate,
        },
        {
          timeout: 120_000, // 2 min — generation is slow
        }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error generando sesiones de personalizada');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMembers(params?: {
    search?: string;
    personalizadaType?: string;
    page?: number;
    limit?: number;
  }): Promise<{ members: MemberPersonalizadaInfo[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ members: MemberPersonalizadaInfo[]; total: number }>(
        '/admin/personalizadas/members',
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

  async function getMemberDetail(userId: number): Promise<MemberPersonalizadaDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberPersonalizadaDetail>(
        `/admin/personalizadas/members/${userId}`
      );
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
    generatePersonalizadaSessions,
    getMembers,
    getMemberDetail,
    cleanup,
  };
}
