<!-- Comunicaciones (Fase 193, D-30/D-31): reemplaza a "Notificaciones" en el
     menú de Configuración. El tab activo viaja en `?tab=` (mismo criterio que
     FeedbackPage.vue) para que el redirect desde /notificaciones y los deep
     links funcionen.

     Cómo se enchufa una pestaña nueva (plan 16 Avisos en TV): agregar un
     `<q-tab name="..." label="..." />` + su `<q-tab-panel name="...">`
     montando el componente de la pestaña (mismo patrón que
     `<PushTab />`/`<AvisosTab />`/`<TarjetasTab />` acá abajo), bajo
     `src/components/comunicaciones/`. -->
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
    </q-tabs>

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="push" class="q-pa-none">
        <PushTab />
      </q-tab-panel>
      <q-tab-panel name="avisos" class="q-pa-none">
        <AvisosTab />
      </q-tab-panel>
      <q-tab-panel name="tarjetas" class="q-pa-none">
        <TarjetasTab />
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

const route = useRoute();
const router = useRouter();

const VALID_TABS = ['push', 'avisos', 'tarjetas'];

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
