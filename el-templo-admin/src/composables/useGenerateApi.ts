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
      const { data } = await api.post<GenerateResult>('/admin/generate', options);
      return data;
    } finally {
      loading.value = false;
    }
  }

  return { loading, getWeekSummary, generateWeek };
}
