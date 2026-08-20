import { ref } from 'vue';
import { api } from 'src/boot/axios';

export interface WeekSummary {
  week: number;
  days: {
    day: string;
    // Actual persisted mode of the day's generated sessions (regular/rom/
    // combos/tecnica), or null when nothing was generated. The read-only badge
    // in "Sesiones generadas" shows this real mode — NOT the day_modes config.
    sessionMode: string | null;
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
  failed?: number;
  warnings?: string[];
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
    dayModes?: Record<string, string>;
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
