import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from 'src/boot/axios';
import { useProfilePhotosApi } from 'src/composables/useProfilePhotosApi';
import type { InvitationsPendingCount } from 'src/types/report';

export interface LandingInboxCounts {
  academy: number;
  labs: number;
  franchise: number;
}

function emptyInvitationsPending(): InvitationsPendingCount {
  return { open: 0, uncontacted: 0, selfActivatedUncontacted: 0 };
}

export const useAdminStore = defineStore('admin', () => {
  const pendingCount = ref(0);
  const lowSessionsAlert = ref(false);
  const weeksAhead = ref(0);
  // Pelotita de Reportes: SP creadas desde la app pendientes de que gestión
  // inicie el seguimiento (dentro del país del usuario).
  const appTrialsPendingCount = ref(0);
  // Invitados "para contactar" (open), de ellos los que no tienen ningún mensaje
  // (uncontacted), y los que se activaron solos desde la app y nadie contactó todavía
  // (selfActivatedUncontacted). El aviso de Renovaciones usa open/uncontacted. El API
  // ya lo acota por rol/sede.
  const invitationsPending = ref<InvitationsPendingCount>(emptyInvitationsPending());
  // Numerito rojo de la pestaña Invitaciones (suma a la pelotita de Reportes): invitados
  // sin ningún mensaje, tanto los que terminaron sus accesos como los recién activados
  // por la app (que hay que contactar MIENTRAS tienen accesos).
  const invitationsBadgeCount = computed(
    () => invitationsPending.value.uncontacted + invitationsPending.value.selfActivatedUncontacted
  );
  // Pelotitas del grupo Landing: leads del sitio público todavía en estado
  // "new" (Academy, Labs, Franquicias). Un solo request para las tres.
  const landingInbox = ref<LandingInboxCounts>({ academy: 0, labs: 0, franchise: 0 });
  // Pelotita de Conquer (fase 201 D-12): alumnos que pidieron el desbloqueo y todavía no
  // fueron activados. Solo la piden owner/admin.
  const conquerRequestsCount = ref(0);
  // Correcciones con video sin responder (fase 202 D-26). Suma a la pelotita de Conquer (DA-46).
  const conquerCorrectionsCount = ref(0);
  // Pelotita de Oficina (fase 205 D-08): menciones sin leer + temas asignados con novedades.
  const oficinaBadgeCount = ref(0);
  // Pelotita de Fotos (fase 214 D-45): fotos de perfil pendientes de revisar + aprobadas
  // con reportes. La API devuelve ambos conteos sobre el conjunto completo de la cola.
  const photoReviewCount = ref(0);

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

  async function fetchInvitationsPendingCount() {
    try {
      const { data } = await api.get<InvitationsPendingCount>(
        '/admin/referrals/invitations/pending-count'
      );
      invitationsPending.value = {
        open: data.open,
        uncontacted: data.uncontacted,
        selfActivatedUncontacted: data.selfActivatedUncontacted,
      };
    } catch {
      // Silently fail - badge will show 0
      invitationsPending.value = emptyInvitationsPending();
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

  async function fetchConquerRequestsCount() {
    try {
      const { data } = await api.get<{ count: number }>('/admin/conquer/requests/count');
      conquerRequestsCount.value = data.count;
    } catch {
      // Silently fail - badge will show nothing
      conquerRequestsCount.value = 0;
    }
  }

  async function fetchConquerCorrectionsCount() {
    try {
      const { data } = await api.get<{ count: number }>('/admin/conquer/corrections/count');
      conquerCorrectionsCount.value = data.count;
    } catch {
      // Silently fail - badge will show nothing
      conquerCorrectionsCount.value = 0;
    }
  }

  async function fetchOficinaBadge() {
    try {
      const { data } = await api.get<{ count: number; mentions: number; assigned: number }>(
        '/admin/office/badge'
      );
      oficinaBadgeCount.value = data.count;
    } catch {
      // Fallo transitorio: se conserva el valor anterior para no apagar la pelotita.
    }
  }

  async function fetchPhotoReviewCount() {
    try {
      const queue = await useProfilePhotosApi().listQueue();
      photoReviewCount.value = queue.counts
        ? queue.counts.pending + queue.counts.reported
        : queue.items.length;
    } catch {
      // Silently fail - badge will show nothing
      photoReviewCount.value = 0;
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
    invitationsPending,
    invitationsBadgeCount,
    landingInbox,
    conquerRequestsCount,
    conquerCorrectionsCount,
    oficinaBadgeCount,
    photoReviewCount,
    fetchPendingCount,
    fetchAppTrialsPendingCount,
    fetchInvitationsPendingCount,
    fetchLandingInbox,
    fetchConquerRequestsCount,
    fetchConquerCorrectionsCount,
    fetchOficinaBadge,
    fetchPhotoReviewCount,
    checkSessionCoverage,
  };
});
