import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from 'src/boot/axios';

export const useAdminStore = defineStore('admin', () => {
  const pendingCount = ref(0);
  const lowSessionsAlert = ref(false);
  const weeksAhead = ref(0);

  async function fetchPendingCount() {
    try {
      const { data } = await api.get<{ count: number }>('/admin/sessions/pending-count');
      pendingCount.value = data.count;
    } catch {
      // Silently fail - badge will show 0
      pendingCount.value = 0;
    }
  }

  async function checkSessionCoverage() {
    try {
      const { data } = await api.get<{
        currentWeek: number;
        weeksWithApproved: number[];
        weeksAhead: number;
      }>('/admin/sessions/coverage');

      weeksAhead.value = data.weeksAhead;
      // Alert if only current week or less has approved sessions (1 week threshold per CONTEXT.md)
      lowSessionsAlert.value = data.weeksAhead <= 1;
    } catch {
      // Silently fail
      lowSessionsAlert.value = false;
    }
  }

  return {
    pendingCount,
    lowSessionsAlert,
    weeksAhead,
    fetchPendingCount,
    checkSessionCoverage,
  };
});
