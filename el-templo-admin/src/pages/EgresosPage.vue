<template>
  <!-- Fase 209 (Egresos): hub con Gastos, Por pagar, Resumen y Rubros. -->
  <q-page class="q-pa-md">
    <!-- Header: título + selector de país (solo owner), igual que Caja -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Egresos</div>
      <div v-if="isOwner" class="col-auto" style="min-width: 180px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="País"
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
      <q-tab :name="EGRESOS_TABS.gastos" label="Gastos" icon="receipt_long" />
      <q-tab :name="EGRESOS_TABS.porPagar" label="Por pagar" icon="schedule" />
      <q-tab :name="EGRESOS_TABS.resumen" label="Resumen" icon="table_chart" />
      <!-- Rubros: ABM de rubros, solo owner y admin (la API lo exige igual). A
           gestión se le oculta la pestaña entera en vez de mostrarle un 403. -->
      <q-tab v-if="canManageRubros" :name="EGRESOS_TABS.rubros" label="Rubros" icon="category" />
    </q-tabs>

    <q-separator />

    <!-- Los paneles se llenan en los planes siguientes. Cada componente recibe
         `selectedCountry` (AR | ES), `isOwner` y `canVoid` por props. -->
    <q-tab-panels v-model="activeTab" keep-alive :swipeable="false" class="bg-transparent">
      <!-- Gastos: lista, alta/edición y detalle (plan 209-13) -->
      <q-tab-panel :name="EGRESOS_TABS.gastos" class="q-px-none" />

      <!-- Por pagar: gastos pendientes y parciales con registro de pago (plan 209-14) -->
      <q-tab-panel :name="EGRESOS_TABS.porPagar" class="q-px-none" />

      <!-- Resumen: matriz por destino y Excel (plan 209-16) -->
      <q-tab-panel :name="EGRESOS_TABS.resumen" class="q-px-none" />

      <!-- Rubros: ABM movido desde Caja > Cuentas (plan 209-12) -->
      <q-tab-panel v-if="canManageRubros" :name="EGRESOS_TABS.rubros" class="q-px-none" />
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { EGRESOS_ANULAR_ROLES } from 'src/config/templo-config';
import {
  EGRESOS_TABS,
  EGRESOS_DEFAULT_TAB,
  EGRESOS_TAB_NAMES,
  type EgresosTab,
} from 'src/constants/egresos';
import type { ExpenseCountry } from 'src/types/expense';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// El owner elige el país en el header y se lo pasamos a todas las pestañas;
// el resto usa el suyo (el server lo fuerza). Default Argentina.
const isOwner = computed(() => authStore.user?.role === 'owner');

// Anular gastos y pagos, y gestionar rubros: owner y admin (EXPENSES_VOID_ROLES).
const canVoid = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && EGRESOS_ANULAR_ROLES.includes(role);
});
const canManageRubros = canVoid;

const countryOptions: Array<{ label: string; value: ExpenseCountry }> = [
  { label: 'Argentina', value: 'AR' },
  { label: 'España', value: 'ES' },
];

const selectedCountry = ref<ExpenseCountry>('AR');

// Pestaña activa, sincronizada con ?tab= para que sobreviva al refresh y al "atrás".
function tabFromQuery(): EgresosTab {
  const q = route.query.tab;
  if (typeof q === 'string' && (EGRESOS_TAB_NAMES as readonly string[]).includes(q)) {
    // ?tab=rubros pegado en la URL por un rol sin ABM: cae al default.
    if (q === EGRESOS_TABS.rubros && !canManageRubros.value) return EGRESOS_DEFAULT_TAB;
    return q as EgresosTab;
  }
  return EGRESOS_DEFAULT_TAB;
}

const activeTab = ref<EgresosTab>(tabFromQuery());

// Persistir la pestaña en la URL sin ensuciar el historial (replace).
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) {
    void router.replace({ query: { ...route.query, tab } });
  }
});

// Y al revés: el botón "atrás" o un hijo que navega con ?tab= cambian la pestaña.
watch(
  () => route.query.tab,
  () => {
    const fromQuery = tabFromQuery();
    if (fromQuery !== activeTab.value) activeTab.value = fromQuery;
  }
);
</script>
