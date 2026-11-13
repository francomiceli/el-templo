<template>
  <!-- Egresos dentro de Caja (2026-11-13): pestaña "Egresos" de Caja con sus propias
       pestañas Gastos, Por pagar, Resumen, Resultado y Rubros. El país lo elige el owner
       en el header de Caja y llega por props. La sub-pestaña vive en ?sub= (el ?tab= es
       de Caja). -->
  <div>
    <q-tabs
      v-model="activeTab"
      align="left"
      active-color="primary"
      indicator-color="primary"
      dense
      inline-label
      class="text-grey-7 q-mt-sm"
    >
      <q-tab :name="EGRESOS_TABS.gastos" label="Gastos" icon="receipt_long" />
      <q-tab :name="EGRESOS_TABS.porPagar" label="Por pagar" icon="schedule" />
      <q-tab :name="EGRESOS_TABS.resumen" label="Resumen" icon="table_chart" />
      <!-- Resultado por sede (fase 211): solo owner y admin (la API lo exige igual). -->
      <q-tab
        v-if="canSeeResult"
        :name="EGRESOS_TABS.resultado"
        label="Resultado"
        icon="assessment"
      />
      <!-- Rubros: ABM de rubros, solo owner y admin (la API lo exige igual). A
           gestión se le oculta la pestaña entera en vez de mostrarle un 403. -->
      <q-tab v-if="canManageRubros" :name="EGRESOS_TABS.rubros" label="Rubros" icon="category" />
    </q-tabs>

    <q-separator />

    <!-- Cada componente recibe `selectedCountry` (AR | ES) e `isOwner` por props; el detalle
         del gasto (único, abajo) recibe además `canVoid`. `refreshKey` hace que las listas
         se refresquen cuando el detalle cambió algo. -->
    <q-tab-panels v-model="activeTab" keep-alive :swipeable="false" class="bg-transparent">
      <!-- Gastos: lista, alta y edición (plan 209-13); la fila abre el detalle (209-15) -->
      <q-tab-panel :name="EGRESOS_TABS.gastos" class="q-px-none">
        <GastosTab
          :selected-country="selectedCountry"
          :is-owner="isOwner"
          :open-new="openNew"
          :refresh-key="refreshKey"
          @new-consumed="onNewConsumed"
          @open-detail="onOpenDetail"
        />
      </q-tab-panel>

      <!-- Por pagar: gastos pendientes y parciales con registro de pago (plan 209-14) -->
      <q-tab-panel :name="EGRESOS_TABS.porPagar" class="q-px-none">
        <PorPagarTab
          :selected-country="selectedCountry"
          :is-owner="isOwner"
          :options="expenseOptions"
          :refresh-key="refreshKey"
          @open-detail="onOpenDetail"
        />
      </q-tab-panel>

      <!-- Resumen: matriz por destino y Excel (plan 209-16) -->
      <q-tab-panel :name="EGRESOS_TABS.resumen" class="q-px-none">
        <ResumenTab
          :selected-country="selectedCountry"
          :is-owner="isOwner"
          :options="expenseOptions"
          :refresh-key="refreshKey"
          @open-detail="onOpenDetail"
        />
      </q-tab-panel>

      <!-- Resultado: cobros menos costos por sede, Casa Matriz y Consolidado (fase 211), solo owner y admin -->
      <q-tab-panel v-if="canSeeResult" :name="EGRESOS_TABS.resultado" class="q-px-none">
        <ResultadoTab
          :selected-country="selectedCountry"
          :is-owner="isOwner"
          :options="expenseOptions"
          :refresh-key="refreshKey"
          @open-detail="onOpenDetail"
        />
      </q-tab-panel>

      <!-- Rubros: ABM movido desde Caja > Cuentas (plan 209-12), solo owner y admin -->
      <q-tab-panel v-if="canManageRubros" :name="EGRESOS_TABS.rubros" class="q-px-none">
        <RubrosTab :selected-country="selectedCountry" />
      </q-tab-panel>
    </q-tab-panels>

    <!-- Detalle del gasto: se monta una sola vez y lo abre cualquier pestaña con onOpenDetail(id) -->
    <GastoDetailDialog
      v-model="showDetail"
      :record-id="detailId"
      :country="selectedCountry"
      :options="expenseOptions"
      :can-void="canVoid"
      @changed="onDetailChanged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toRef, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'src/stores/useAuthStore';
import { EGRESOS_ANULAR_ROLES, EGRESOS_RESULTADO_ROLES } from 'src/config/templo-config';
import {
  EGRESOS_TABS,
  EGRESOS_DEFAULT_TAB,
  EGRESOS_TAB_NAMES,
  type EgresosTab,
} from 'src/constants/egresos';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type { ExpenseCountry, ExpenseFormOptions } from 'src/types/expense';
import GastoDetailDialog from 'src/components/egresos/GastoDetailDialog.vue';
import GastosTab from 'src/components/egresos/GastosTab.vue';
import PorPagarTab from 'src/components/egresos/PorPagarTab.vue';
import ResultadoTab from 'src/components/egresos/ResultadoTab.vue';
import ResumenTab from 'src/components/egresos/ResumenTab.vue';
import RubrosTab from 'src/components/egresos/RubrosTab.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const $q = useQuasar();
const log = createLogger('EgresosHub');
const expensesApi = useExpensesApi();

// País e isOwner llegan de Caja (selector del header de Caja, solo owner).
const props = defineProps<{
  selectedCountry: ExpenseCountry;
  isOwner: boolean;
}>();
const selectedCountry = toRef(props, 'selectedCountry');
const isOwner = toRef(props, 'isOwner');

// Anular gastos y pagos, y gestionar rubros: owner y admin (EXPENSES_VOID_ROLES).
const canVoid = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && EGRESOS_ANULAR_ROLES.includes(role);
});
const canManageRubros = canVoid;

// Resultado por sede: solo owner y admin (EXPENSES_RESULT_ROLES). Set propio, no reusa canVoid.
const canSeeResult = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && EGRESOS_RESULTADO_ROLES.includes(role);
});

// Opciones del formulario de Egresos (cuentas de pago, destinos, rubros, hoy) del país
// elegido: se cargan acá una sola vez y se comparten con Por pagar y con el detalle
// del gasto (209-15), que las necesita para el diálogo de pago. Null mientras cargan.
const expenseOptions = ref<ExpenseFormOptions | null>(null);
let optionsSeq = 0;

async function loadExpenseOptions() {
  const seq = ++optionsSeq;
  expenseOptions.value = null;
  try {
    const result = await expensesApi.getExpenseFormOptions(selectedCountry.value);
    if (seq === optionsSeq) expenseOptions.value = result;
  } catch (err: unknown) {
    if (seq !== optionsSeq) return;
    const message = extractError(err, 'Error cargando las opciones de Egresos');
    log.error('Error cargando form-options', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

onMounted(loadExpenseOptions);
watch(selectedCountry, loadExpenseOptions);

onUnmounted(() => {
  expensesApi.cleanup();
});

// Detalle del gasto (209-15): un único diálogo para toda la página. Lo abren Gastos, Por pagar
// y (209-16) el Resumen llamando a `onOpenDetail(id)`, sin importar qué pestaña esté activa.
const showDetail = ref(false);
const detailId = ref<number | null>(null);

// Se incrementa cuando el detalle cambia algo (pago, edición, anulación): las pestañas con
// lista lo reciben por `refresh-key` y se recargan (la oculta, al volver a mostrarse).
const refreshKey = ref(0);

function onOpenDetail(id: number) {
  detailId.value = id;
  showDetail.value = true;
}

function onDetailChanged() {
  refreshKey.value += 1;
}

// Otro país: el gasto abierto ya no corresponde a lo que se está mirando.
watch(selectedCountry, () => {
  showDetail.value = false;
});

// Sub-pestaña activa, sincronizada con ?sub= (el ?tab= es la pestaña de Caja) para que
// sobreviva al refresh y al "atrás".
function tabFromQuery(): EgresosTab {
  const q = route.query.sub;
  if (typeof q === 'string' && (EGRESOS_TAB_NAMES as readonly string[]).includes(q)) {
    // ?sub=resultado o ?sub=rubros pegado en la URL por un rol sin permiso: cae al default.
    if (q === EGRESOS_TABS.resultado && !canSeeResult.value) return EGRESOS_DEFAULT_TAB;
    if (q === EGRESOS_TABS.rubros && !canManageRubros.value) return EGRESOS_DEFAULT_TAB;
    return q as EgresosTab;
  }
  return EGRESOS_DEFAULT_TAB;
}

const activeTab = ref<EgresosTab>(tabFromQuery());

// Persistir la sub-pestaña en la URL sin ensuciar el historial (replace).
watch(activeTab, (sub) => {
  if (route.query.sub !== sub) {
    void router.replace({ query: { ...route.query, sub } });
  }
});

// "Nuevo gasto" desde el diálogo Registrar de Caja llega como
// /caja?tab=egresos&sub=gastos&nuevo=1. Los paneles están
// en keep-alive, así que la pestaña lo recibe por prop reactiva (no solo al montar).
const openNew = computed(() => route.query.nuevo === '1');

// Una vez abierto el alta se limpia `nuevo`, así un refresh no la reabre.
function onNewConsumed() {
  if (route.query.nuevo !== undefined) {
    void router.replace({ query: { ...route.query, nuevo: undefined } });
  }
}

// Y al revés: el botón "atrás" o un hijo que navega con ?sub= cambian la sub-pestaña.
watch(
  () => route.query.sub,
  () => {
    const fromQuery = tabFromQuery();
    if (fromQuery !== activeTab.value) activeTab.value = fromQuery;
  }
);
</script>
