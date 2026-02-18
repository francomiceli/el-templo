import { ref } from 'vue';
import { api } from 'src/boot/axios';

export interface WeekSummary {
  week: number;
  days: {
    day: string;
    levels: {
      levelGroup: string;
      hasSession: boolean;
      status: string | null;
    }[];
  }[];
}

export interface GenerateResult {
  generated: number;
  skipped: number;
}

export function useGenerateApi() {
  const loading = ref(false);

  async function getCurrentWeek(): Promise<number> {
    const { data } = await api.get<{ currentWeek: number }>('/admin/sessions/coverage');
    return data.currentWeek;
  }

  async function getWeekSummary(week: number): Promise<WeekSummary> {
    const { data } = await api.get<WeekSummary>(`/admin/weeks/${week}/summary`);
    return data;
  }

  async function generateWeek(options: {
    week: number;
    days?: string[];
    levelGroups?: string[];
    regenerate?: boolean;
  }): Promise<GenerateResult> {
    loading.value = true;
    try {
      const { data } = await api.post<GenerateResult>('/admin/generate', options, {
        timeout: 120_000, // 2 min — full week generation is slow
      });
      return data;
    } finally {
      loading.value = false;
    }
  }

  return { loading, getCurrentWeek, getWeekSummary, generateWeek };
}
