<!-- Comunicaciones (Fase 193, D-30/D-31): reemplaza a "Notificaciones" en el
     menú de Configuración. El tab activo viaja en `?tab=` (mismo criterio que
     FeedbackPage.vue) para que el redirect desde /notificaciones y los deep
     links funcionen.

     Plan 16 (Avisos en TV, D-23): la pestaña se enchufó con el mismo patrón
     que `<PushTab />`/`<AvisosTab />`/`<TarjetasTab />` acá abajo, bajo
     `src/components/comunicaciones/`. El gate de módulo (`templo-training`)
     es responsabilidad de `TvAvisosTab.vue` — la pestaña siempre se ve, el
     404 del guard se muestra como un estado vacío explicativo adentro.

     Plan 14 (número de ventas, D-20): "Ajustes" NO es una pestaña propia —
     vive como bloque colapsable arriba de la tabla de tarjetas, dentro del
     panel "tarjetas" (una de las dos ubicaciones que dejaba a discreción el
     CONTEXT). Visible por defecto (`default-opened`), no escondido. -->
<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Comunicaciones</div>

    <q-tabs
      v-model="tab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="push" label="Notificaciones push" />
      <q-tab name="avisos" label="Avisos en la app" />
      <q-tab name="tarjetas" label="Tarjetas de Mi Templo" />
      <q-tab name="tv" label="Avisos en TV" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="push" class="q-pa-none">
        <PushTab />
      </q-tab-panel>
      <q-tab-panel name="avisos" class="q-pa-none">
        <AvisosTab />
      </q-tab-panel>
      <q-tab-panel name="tarjetas" class="q-pa-none">
        <q-expansion-item
          default-opened
          dense
          icon="settings"
          label="Ajustes"
          header-class="text-subtitle1 text-weight-medium"
          class="q-mb-md bg-white"
        >
          <AjustesVentas />
        </q-expansion-item>
        <TarjetasTab />
      </q-tab-panel>
      <q-tab-panel name="tv" class="q-pa-none">
        <TvAvisosTab />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PushTab from 'src/components/comunicaciones/PushTab.vue';
import AvisosTab from 'src/components/comunicaciones/AvisosTab.vue';
import TarjetasTab from 'src/components/comunicaciones/TarjetasTab.vue';
import AjustesVentas from 'src/components/comunicaciones/AjustesVentas.vue';
import TvAvisosTab from 'src/components/comunicaciones/TvAvisosTab.vue';

const route = useRoute();
const router = useRouter();

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
</script>
