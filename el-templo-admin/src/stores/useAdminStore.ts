import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from 'src/boot/axios';

export interface LandingInboxCounts {
  academy: number;
  labs: number;
  franchise: number;
}

export const useAdminStore = defineStore('admin', () => {
  const pendingCount = ref(0);
  const lowSessionsAlert = ref(false);
  const weeksAhead = ref(0);
  // Pelotita de Reportes: SP creadas desde la app pendientes de que gestión
  // inicie el seguimiento (dentro del país del usuario).
  const appTrialsPendingCount = ref(0);
  // Pelotitas del grupo Landing: leads del sitio público todavía en estado
  // "new" (Academy, Labs, Franquicias). Un solo request para las tres.
  const landingInbox = ref<LandingInboxCounts>({ academy: 0, labs: 0, franchise: 0 });

  async function fetchPendingCount() {
    try {
      const { data } = await api.get<{ count: number }>('/admin/sessions/pending-count');
      pendingCount.value = data.count;
    } catch {
      // Silently fail - badge will show 0
      pendingCount.value = 0;
    }
  }

  async function fetchAppTrialsPendingCount() {
    try {
      const { data } = await api.get<{ count: number }>(
        '/admin/reports/trial-sessions/app-pending-count'
      );
      appTrialsPendingCount.value = data.count;
    } catch {
      // Silently fail - badge will show 0
      appTrialsPendingCount.value = 0;
    }
  }

  async function fetchLandingInbox() {
    try {
      const { data } = await api.get<LandingInboxCounts>('/app/admin/landing-inbox');
      landingInbox.value = data;
    } catch {
      // Silently fail - badges will show nothing
      landingInbox.value = { academy: 0, labs: 0, franchise: 0 };
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
    appTrialsPendingCount,
    landingInbox,
    fetchPendingCount,
    fetchAppTrialsPendingCount,
    fetchLandingInbox,
    checkSessionCoverage,
  };
});
