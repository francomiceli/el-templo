<!-- Feedback: la voz del alumno en un solo lugar (Dueño-only). Cuatro tabs:
     Clases (puntuaciones de clase, ex tab de Analíticas — Dueño),
     Profes (puntuaciones de profes, ex /puntuaciones — owner),
     Sugerencias (ex /propuestas — Dueño) y Registro del día (check-ins
     diarios de energía/molestias/sueño — Dueño).
     Los filtros fecha/sucursal son compartidos entre tabs; cada tab
     agrega los suyos. El tab activo viaja en ?tab= para deep links
     (las rutas viejas redirigen acá). -->
<template>
  <q-page padding>
    <div class="text-h5 q-mb-md">Feedback</div>

    <!-- Filtros compartidos: fecha (sobre la fecha de la clase / del envío) + sucursal -->
    <div class="row q-gutter-sm q-mb-md items-center">
      <q-input
        v-model="filters.dateFrom"
        type="date"
        label="Desde"
        outlined
        dense
        clearable
        class="col-6 col-sm-2"
      />
      <q-input
        v-model="filters.dateTo"
        type="date"
        label="Hasta"
        outlined
        dense
        clearable
        class="col-6 col-sm-2"
      />
      <q-select
        v-model="filters.branchId"
        :options="branchOptions"
        emit-value
        map-options
        label="Sucursal"
        outlined
        dense
        clearable
        class="col-12 col-sm-3"
      />
    </div>

    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab
        v-for="t in visibleTabs"
        :key="t.name"
        :name="t.name"
        :label="t.label"
        :icon="t.icon"
      />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel v-if="canSee('clases')" name="clases" class="q-pa-none">
        <ClasesTab :filters="filters" />
      </q-tab-panel>
      <q-tab-panel v-if="canSee('profes')" name="profes" class="q-pa-none">
        <ProfesTab :filters="filters" />
      </q-tab-panel>
      <q-tab-panel v-if="canSee('sugerencias')" name="sugerencias" class="q-pa-none">
        <SugerenciasTab :filters="filters" />
      </q-tab-panel>
      <q-tab-panel v-if="canSee('registro')" name="registro" class="q-pa-none">
        <RegistroDiaTab :filters="filters" />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClasesTab from 'src/components/feedback/ClasesTab.vue';
import ProfesTab from 'src/components/feedback/ProfesTab.vue';
import SugerenciasTab from 'src/components/feedback/SugerenciasTab.vue';
import RegistroDiaTab from 'src/components/feedback/RegistroDiaTab.vue';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import { DUENO_ROLES } from 'src/config/templo-config';
import { createLogger } from 'src/utils/logger';
import type { AdminRole } from 'src/types/admin';
import type { BranchOption } from 'src/types/member';
import type { FeedbackFilters } from 'src/components/feedback/feedback-filters';

const log = createLogger('FeedbackPage');
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const membersApi = useMembersApi();

/**
 * Roles por tab. La página entera es Dueño-only (router + nav, decisión
 * 2026-07-16); adentro, Profes queda owner-only como su ex página
 * /puntuaciones. El API sigue siendo el gate real de cada endpoint.
 */
const TABS: Array<{ name: string; label: string; icon: string; roles: AdminRole[] }> = [
  { name: 'clases', label: 'Clases', icon: 'star', roles: DUENO_ROLES },
  { name: 'profes', label: 'Profes', icon: 'groups', roles: ['owner'] },
  { name: 'sugerencias', label: 'Sugerencias', icon: 'emoji_objects', roles: DUENO_ROLES },
  { name: 'registro', label: 'Registro del día', icon: 'event_available', roles: DUENO_ROLES },
];

const role = computed(() => authStore.user?.role);
const visibleTabs = computed(() => TABS.filter((t) => role.value && t.roles.includes(role.value)));

function canSee(name: string): boolean {
  return visibleTabs.value.some((t) => t.name === name);
}

function initialTab(): string {
  const requested = typeof route.query.tab === 'string' ? route.query.tab : null;
  if (requested && canSee(requested)) return requested;
  return visibleTabs.value[0]?.name ?? 'sugerencias';
}

const activeTab = ref(initialTab());

// Deep link: el tab activo viaja en la query (replace: sin ensuciar el historial).
watch(activeTab, (tab) => {
  void router.replace({ query: { ...route.query, tab } });
});

const filters = reactive<FeedbackFilters>({ dateFrom: null, dateTo: null, branchId: null });

const branchOptions = ref<Array<{ label: string; value: number }>>([]);

async function fetchBranches(): Promise<void> {
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = branches.map((b: BranchOption) => ({ label: b.name, value: b.id }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching branches', { error: message });
  }
}

onMounted(() => {
  void fetchBranches();
});
</script>
