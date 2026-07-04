<template>
  <!-- Phase 153 — hub de Deudas (analog CajaPage, fase 152): Por socio (cobro -->
  <!-- rápido en la puerta) + Por deuda (detalle con motivo/período/fecha).     -->
  <!-- El tab "Vencidos" lo agrega el plan 153-04.                              -->
  <q-page padding>
    <!-- Header: title + owner-only País selector (feeds Por deuda scope). -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Deudas</div>
      <div v-if="isOwner" class="col-auto" style="min-width: 180px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="Pais"
          dense
          outlined
          emit-value
          map-options
        />
      </div>
    </div>

    <q-tabs
      v-model="activeTab"
      align="left"
      active-color="primary"
      indicator-color="primary"
      dense
      class="text-grey-7"
    >
      <q-tab :name="DEUDAS_TABS.porSocio" label="Por socio" icon="people" />
      <!-- Detail tab hidden for coach (D-12) — the real gate lives in the API. -->
      <q-tab
        v-if="canSeeDetail"
        :name="DEUDAS_TABS.porDeuda"
        label="Por deuda"
        icon="request_quote"
      />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" keep-alive :swipeable="false" class="bg-transparent">
      <!-- Por socio — verbatim migration of the previous DeudasPage body (D-01). -->
      <q-tab-panel :name="DEUDAS_TABS.porSocio" class="q-px-none">
        <PorSocioTab />
      </q-tab-panel>

      <!-- Por deuda — detailed row-per-debt report moved from Reportes (D-02). -->
      <q-tab-panel v-if="canSeeDetail" :name="DEUDAS_TABS.porDeuda" class="q-px-none">
        <PorDeudaTab
          :branch-options="branchOptions"
          :display-currency="displayCurrency"
          :country-scope="countryScope"
          :is-owner="isOwner"
        />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import { DEUDAS_DETAIL_ROLES } from 'src/config/templo-config';
import { DEUDAS_TABS, DEUDAS_DEFAULT_TAB, type DeudasTab } from 'src/constants/deudas';
import { createLogger } from 'src/utils/logger';
import type { BranchOption } from 'src/types/member';
import PorSocioTab from 'src/components/deudas/PorSocioTab.vue';
import PorDeudaTab from 'src/components/deudas/PorDeudaTab.vue';

const log = createLogger('DeudasPage');
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const membersApi = useMembersApi();

// =========================================================================
// Role gating (D-12) — the coach only sees "Por socio"; "Por deuda" is
// business management (gestion/admin/owner). This only HIDES the tab; the
// real gate is the API (reports/outstanding-balances returns 403 to coach).
// =========================================================================

const isOwner = computed(() => authStore.user?.role === 'owner');
const canSeeDetail = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && DEUDAS_DETAIL_ROLES.includes(role);
});

// Tabs currently rendered for this user (vencidos wired by plan 153-04).
const visibleTabs = computed<DeudasTab[]>(() =>
  canSeeDetail.value ? [DEUDAS_TABS.porSocio, DEUDAS_TABS.porDeuda] : [DEUDAS_TABS.porSocio]
);

// =========================================================================
// Owner-only country selector — feeds the Por deuda scope (mirrors CajaPage /
// ReportesPage). Non-owners omit country (server derives from branch scope).
// =========================================================================

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

const selectedCountry = ref<'AR' | 'ES'>('AR');

const displayCurrency = computed<'ARS' | 'EUR'>(() =>
  selectedCountry.value === 'ES' ? 'EUR' : 'ARS'
);

const countryScope = computed<'AR' | 'ES' | undefined>(() =>
  isOwner.value ? selectedCountry.value : undefined
);

// Branch options for the Por deuda filter (same list as Reportes provided).
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  { label: 'Todas las sedes', value: undefined },
]);

async function fetchBranches(): Promise<void> {
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = [
      { label: 'Todas las sedes', value: undefined },
      ...branches.map((b: BranchOption) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching branches', { error: message });
  }
}

// =========================================================================
// Tab model — landing = Por socio (D-03), synced to ?tab= for refresh/back
// persistence. Falls back to the default when the requested tab is not
// visible for the role (coach forcing ?tab=porDeuda), not only when unknown.
// =========================================================================

function tabFromQuery(): DeudasTab {
  const q = route.query.tab;
  if (typeof q === 'string' && (visibleTabs.value as readonly string[]).includes(q)) {
    return q as DeudasTab;
  }
  return DEUDAS_DEFAULT_TAB;
}

const activeTab = ref<DeudasTab>(tabFromQuery());

// Persist the active tab to the URL without polluting history (replace).
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) {
    void router.replace({ query: { ...route.query, tab } });
  }
});

onMounted(() => {
  void fetchBranches();
});
</script>
