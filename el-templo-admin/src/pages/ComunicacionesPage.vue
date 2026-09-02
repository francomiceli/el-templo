<!-- Comunicaciones (Fase 193, D-30/D-31): reemplaza a "Notificaciones" en el
     menú de Configuración. El tab activo viaja en `?tab=` (mismo criterio que
     FeedbackPage.vue) para que el redirect desde /notificaciones y los deep
     links funcionen.

     Cómo se enchufa una pestaña nueva (planes 11 Avisos, 14 Tarjetas +
     Ajustes, 16 Avisos en TV): agregar un `<q-tab name="..." label="..." />`
     + su `<q-tab-panel name="...">` montando el componente de la pestaña
     (mismo patrón que `<PushTab />` acá abajo), bajo
     `src/components/comunicaciones/`. Este plan deja UNA sola pestaña
     (Push) — no se agregan placeholders para las que faltan. -->
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
    </q-tabs>

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="push" class="q-pa-none">
        <PushTab />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PushTab from 'src/components/comunicaciones/PushTab.vue';

const route = useRoute();
const router = useRouter();

const VALID_TABS = ['push'];

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
