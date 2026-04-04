import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  GoalPlanType,
  GoalPlanGenerateResult,
  MemberGoalPlanInfo,
  MemberGoalPlanDetail,
} from 'src/types/goal-plan';

export function useGoalPlanAdminApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function generateGoalPlanSessions(
    week: number,
    goalPlanType: GoalPlanType,
    options?: { days?: string[]; regenerate?: boolean },
  ): Promise<GoalPlanGenerateResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<GoalPlanGenerateResult>(
        '/admin/goal-plans/generate',
        {
          week,
          goalPlanType,
          days: options?.days,
          regenerate: options?.regenerate,
        },
        {
          timeout: 120_000, // 2 min — generation is slow
        },
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error generando sesiones de plan por objetivos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMembers(params?: {
    search?: string;
    goalPlanType?: string;
    page?: number;
    limit?: number;
  }): Promise<{ members: MemberGoalPlanInfo[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ members: MemberGoalPlanInfo[]; total: number }>(
        '/admin/goal-plans/members',
        { params },
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMemberDetail(userId: number): Promise<MemberGoalPlanDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberGoalPlanDetail>(
        `/admin/goal-plans/members/${userId}`,
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
    generateGoalPlanSessions,
    getMembers,
    getMemberDetail,
    cleanup,
  };
}
