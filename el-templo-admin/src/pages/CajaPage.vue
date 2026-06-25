<template>
  <!-- Módulo Contable v5.2 (fases 137-142): hub de Caja — saldos, bandeja de pendientes e historial. -->
  <q-page class="q-pa-md">
    <!-- Header: title + owner-only País selector (moved up from Movimientos) -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Caja</div>
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

    <!-- ========================================== -->
    <!-- Tab hub (D-01) — Pendientes is the landing -->
    <!-- ========================================== -->
    <q-tabs
      v-model="activeTab"
      align="left"
      active-color="primary"
      indicator-color="primary"
      dense
      class="text-grey-7"
    >
      <q-tab :name="CAJA_TABS.pendientes" label="Pendientes" icon="inbox">
        <q-badge v-if="vencidoCount > 0" floating color="negative">{{ vencidoCount }}</q-badge>
      </q-tab>
      <q-tab :name="CAJA_TABS.saldos" label="Saldos" icon="account_balance_wallet" />
      <q-tab :name="CAJA_TABS.movimientos" label="Movimientos" icon="receipt_long" />
      <q-tab :name="CAJA_TABS.movEgresos" label="Mov. y egresos" icon="swap_horiz" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" keep-alive :swipeable="false" class="bg-transparent">
      <!-- Pendientes — bandeja daily-control surface (REP-01) -->
      <q-tab-panel :name="CAJA_TABS.pendientes" class="q-px-none">
        <BandejaPendientesTab
          :selected-country="selectedCountry"
          :is-owner="isOwner"
          @update:vencido-count="vencidoCount = $event"
        />
      </q-tab-panel>

      <!-- Saldos por caja (REP-02 / D-06) -->
      <q-tab-panel :name="CAJA_TABS.saldos" class="q-px-none">
        <SaldosPorCajaTab :selected-country="selectedCountry" :is-owner="isOwner" />
      </q-tab-panel>

      <!-- Movimientos — verbatim migration of the previous CajaPage body -->
      <q-tab-panel :name="CAJA_TABS.movimientos" class="q-px-none">
        <MovimientosTab :selected-country="selectedCountry" :is-owner="isOwner" />
      </q-tab-panel>

      <!-- Mov. y egresos — historial filterable, NULL-member rows (REP-03) -->
      <q-tab-panel :name="CAJA_TABS.movEgresos" class="q-px-none">
        <MovEgresosTab :selected-country="selectedCountry" :is-owner="isOwner" />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { CAJA_TABS, CAJA_DEFAULT_TAB, CAJA_TAB_NAMES, type CajaTab } from 'src/constants/caja';
import BandejaPendientesTab from 'src/components/caja/BandejaPendientesTab.vue';
import MovEgresosTab from 'src/components/caja/MovEgresosTab.vue';
import MovimientosTab from 'src/components/caja/MovimientosTab.vue';
import SaldosPorCajaTab from 'src/components/caja/SaldosPorCajaTab.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// =========================================================================
// Owner-only country selector (D-06 / D-10) — lives in the hub header and is
// passed down to every tab so they all scope to the same country.
// =========================================================================

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

// Default Argentina per D-06 (no Todos mode, no session persistence).
const selectedCountry = ref<'AR' | 'ES'>('AR');

// Vencido (overdue) pendientes count, emitted up from the bandeja tab so the
// Pendientes tab floating badge stays visible from any tab (D-08).
const vencidoCount = ref(0);

// =========================================================================
// Tab model — landing = Pendientes (D-01), synced to ?tab= for refresh/back
// persistence (UI-SPEC assumption 1).
// =========================================================================

function tabFromQuery(): CajaTab {
  const q = route.query.tab;
  if (typeof q === 'string' && (CAJA_TAB_NAMES as readonly string[]).includes(q)) {
    return q as CajaTab;
  }
  return CAJA_DEFAULT_TAB;
}

const activeTab = ref<CajaTab>(tabFromQuery());

// Persist the active tab to the URL without polluting history (replace).
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) {
    void router.replace({ query: { ...route.query, tab } });
  }
});
</script>
