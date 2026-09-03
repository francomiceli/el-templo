<!-- Comunicaciones (Fase 193, Plan B — dashboard, pedido de Franco
     2026-09-03): reemplaza el layout de "tabs + tablas" por un dashboard.
     Arriba, 4 KpiCard (una por categoría) con el número de activas + una
     línea de métricas acumuladas; clic en una card selecciona la categoría
     (se mantiene el sync con `?tab=` que ya tenía la página). Debajo, la
     categoría elegida muestra sus ítems como grilla de `ComunicacionCard`.

     Los 4 listados (push/avisos-popup/avisos-tarjeta/tv) se cargan en
     PARALELO acá, una sola vez al montar — así las 4 KpiCard tienen número
     aunque el staff nunca haya visitado esa categoría (pedido explícito del
     plan). Cada categoría le pide `reload` al padre después de
     crear/editar/borrar/restaurar/toggle; avisos y tarjetas comparten
     `reloadAvisos` porque son la MISMA entidad (`avisos`, distinta
     `placement`) — un "Restaurar las del sistema" desde cualquiera de las
     dos afecta a la otra.

     Ajustes (WhatsApp de ventas) ya no vive dentro de Tarjetas: es un botón
     con ícono de engranaje en la cabecera de la página que abre
     `AjustesDialog.vue` (plan, punto 5). -->
<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Comunicaciones</div>
      </div>
      <div class="col-auto">
        <q-btn flat round dense icon="settings" @click="ajustesOpen = true">
          <q-tooltip>Ajustes</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <KpiCard
          label="Notificaciones push"
          icon="notifications_active"
          :value="pushKpi.value"
          :hint="pushKpi.hint"
          :active="tab === 'push'"
          :loading="loading.push"
          @click="tab = 'push'"
        />
      </div>
      <div class="col-6 col-md-3">
        <KpiCard
          label="Avisos en la app"
          icon="campaign"
          :value="avisosKpi.value"
          :hint="avisosKpi.hint"
          :active="tab === 'avisos'"
          :loading="loading.avisos"
          @click="tab = 'avisos'"
        />
      </div>
      <div class="col-6 col-md-3">
        <KpiCard
          label="Tarjetas de Mi Templo"
          icon="style"
          :value="tarjetasKpi.value"
          :hint="tarjetasKpi.hint"
          :active="tab === 'tarjetas'"
          :loading="loading.avisos"
          @click="tab = 'tarjetas'"
        />
      </div>
      <div class="col-6 col-md-3">
        <KpiCard
          label="Avisos en TV"
          icon="tv"
          :value="tvKpi.value"
          :hint="tvKpi.hint"
          :active="tab === 'tv'"
          :loading="loading.tv"
          @click="tab = 'tv'"
        />
      </div>
    </div>

    <PushTab v-if="tab === 'push'" :templates="templates" :branches="branches" @reload="loadPush" />
    <AvisosTab
      v-else-if="tab === 'avisos'"
      :avisos="avisosPopup"
      :branches="branches"
      @reload="loadAvisos"
    />
    <TarjetasTab
      v-else-if="tab === 'tarjetas'"
      :tarjetas="avisosTarjeta"
      :branches="branches"
      @reload="loadAvisos"
    />
    <TvAvisosTab
      v-else-if="tab === 'tv'"
      :avisos="tvAvisos"
      :module-disabled="tvModuleDisabled"
      :branches="branches"
      @reload="loadTv"
    />

    <AjustesDialog v-model="ajustesOpen" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import axios from 'axios';
import { useRoute, useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';
import PushTab from 'src/components/comunicaciones/PushTab.vue';
import AvisosTab from 'src/components/comunicaciones/AvisosTab.vue';
import TarjetasTab from 'src/components/comunicaciones/TarjetasTab.vue';
import TvAvisosTab from 'src/components/comunicaciones/TvAvisosTab.vue';
import AjustesDialog from 'src/components/comunicaciones/AjustesDialog.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AvisoRow, TemplateRow, TvAvisoRow } from 'src/composables/useCommunicationsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { BranchOption } from 'src/types/member';
import {
  computeAvisosKpi,
  computePushKpi,
  computeTarjetasKpi,
  computeTvKpi,
} from 'src/utils/comunicaciones-kpis';

const log = createLogger('ComunicacionesPage');
const route = useRoute();
const router = useRouter();
const commsApi = useCommunicationsApi();
const membersApi = useMembersApi();

const VALID_TABS = ['push', 'avisos', 'tarjetas', 'tv'];

function initialTab(): string {
  const requested = typeof route.query.tab === 'string' ? route.query.tab : null;
  return requested && VALID_TABS.includes(requested) ? requested : 'push';
}

const tab = ref(initialTab());

// Deep link: el tab activo viaja en la query (replace: sin ensuciar el historial).
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value } });
});

const ajustesOpen = ref(false);

// ── Estado de los 4 listados (cargados en paralelo al montar) ────────────
const templates = ref<TemplateRow[]>([]);
const avisosPopup = ref<AvisoRow[]>([]);
const avisosTarjeta = ref<AvisoRow[]>([]);
const tvAvisos = ref<TvAvisoRow[]>([]);
const tvModuleDisabled = ref(false);
const branches = ref<BranchOption[]>([]);

const loading = reactive({ push: true, avisos: true, tv: true });

async function loadPush(): Promise<void> {
  loading.push = true;
  try {
    templates.value = await commsApi.listTemplates();
  } catch (err: unknown) {
    log.error('Error loading templates', { error: extractError(err, 'Error cargando push') });
  } finally {
    loading.push = false;
  }
}

async function loadAvisos(): Promise<void> {
  loading.avisos = true;
  try {
    const [popup, tarjeta] = await Promise.all([
      commsApi.listAvisos('popup'),
      commsApi.listAvisos('tarjeta'),
    ]);
    avisosPopup.value = popup;
    avisosTarjeta.value = tarjeta;
  } catch (err: unknown) {
    log.error('Error loading avisos', { error: extractError(err, 'Error cargando avisos') });
  } finally {
    loading.avisos = false;
  }
}

/** 404 en el listado de avisos de TV significa "módulo apagado" (D-23,
 * mismo criterio que la vieja TvAvisosTab.vue), nunca un error real. */
function isModuleGateResponse(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

async function loadTv(): Promise<void> {
  loading.tv = true;
  try {
    tvAvisos.value = await commsApi.listTvAvisos();
    tvModuleDisabled.value = false;
  } catch (err: unknown) {
    if (isModuleGateResponse(err)) {
      tvModuleDisabled.value = true;
      tvAvisos.value = [];
    } else {
      log.error('Error loading tv avisos', { error: extractError(err, 'Error cargando TV') });
    }
  } finally {
    loading.tv = false;
  }
}

async function loadBranches(): Promise<void> {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    log.error('Error loading branches', { error: extractError(err, 'Error cargando sedes') });
  }
}

// ── KPIs (funciones puras, src/utils/comunicaciones-kpis.ts) ─────────────
const pushKpi = computed(() => computePushKpi(templates.value));
const avisosKpi = computed(() => computeAvisosKpi(avisosPopup.value));
const tarjetasKpi = computed(() => computeTarjetasKpi(avisosTarjeta.value));
const tvKpi = computed(() => computeTvKpi(tvAvisos.value));

onMounted(() => {
  void loadBranches();
  void loadPush();
  void loadAvisos();
  void loadTv();
});
onUnmounted(() => {
  commsApi.cleanup();
  membersApi.cleanup();
});
</script>

<!-- deploy 2026-09-03: dashboard de comunicaciones + reglas propias (el push anterior murió en CI, este fuerza el build del admin) -->
