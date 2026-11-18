<!-- Comunidad (fase 215, ajustes): Fotos de perfil y Regalos de Aura en una página con pestañas,
     como Caja con su pestaña Egresos. Cada pestaña mantiene sus roles (Fotos: todo el staff;
     Regalos: dueño, admin y admin_sede). Si el rol ve una sola pestaña no se dibuja la barra. El
     gate real es el API: esto solo oculta. La pelotita de fotos pendientes y reportadas va en el
     ítem del menú y en la pestaña Fotos. -->
<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Comunidad</div>

    <q-tabs
      v-if="visibleTabs.length > 1"
      v-model="activeTab"
      align="left"
      active-color="primary"
      indicator-color="primary"
      dense
      class="text-grey-7"
    >
      <q-tab :name="COMUNIDAD_TABS.fotos" label="Fotos" icon="face">
        <q-badge v-if="adminStore.photoReviewCount > 0" floating color="negative">
          {{ adminStore.photoReviewCount }}
        </q-badge>
      </q-tab>
      <q-tab
        v-if="canSeeRegalos"
        :name="COMUNIDAD_TABS.regalos"
        label="Regalos de Aura"
        icon="volunteer_activism"
      />
    </q-tabs>

    <q-separator v-if="visibleTabs.length > 1" />

    <q-tab-panels v-model="activeTab" keep-alive :swipeable="false" class="bg-transparent">
      <q-tab-panel v-if="canSeeFotos" :name="COMUNIDAD_TABS.fotos" class="q-pa-none">
        <FotosTab />
      </q-tab-panel>
      <q-tab-panel v-if="canSeeRegalos" :name="COMUNIDAD_TABS.regalos" class="q-pa-none">
        <RegalosTab />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useAdminStore } from 'src/stores/useAdminStore';
import {
  COMUNIDAD_DEFAULT_TAB,
  COMUNIDAD_TAB_NAMES,
  COMUNIDAD_TABS,
  type ComunidadTab,
} from 'src/constants/comunidad';
import { COMUNIDAD_FOTOS_ROLES, COMUNIDAD_REGALOS_ROLES } from 'src/config/templo-config';
import FotosTab from 'src/components/comunidad/FotosTab.vue';
import RegalosTab from 'src/components/comunidad/RegalosTab.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const adminStore = useAdminStore();

const canSeeFotos = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && COMUNIDAD_FOTOS_ROLES.includes(role);
});
const canSeeRegalos = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && COMUNIDAD_REGALOS_ROLES.includes(role);
});

/** Pestañas que el rol ve, en el orden de la barra. */
const visibleTabs = computed<ComunidadTab[]>(() => {
  const tabs: ComunidadTab[] = [];
  if (canSeeFotos.value) tabs.push(COMUNIDAD_TABS.fotos);
  if (canSeeRegalos.value) tabs.push(COMUNIDAD_TABS.regalos);
  return tabs;
});

/** Pestaña pedida en `?tab=`; una que el rol no ve (o inventada) cae en la primera que sí ve. */
function tabFromQuery(): ComunidadTab {
  const q = route.query.tab;
  if (
    typeof q === 'string' &&
    (COMUNIDAD_TAB_NAMES as readonly string[]).includes(q) &&
    visibleTabs.value.includes(q as ComunidadTab)
  ) {
    return q as ComunidadTab;
  }
  return visibleTabs.value[0] ?? COMUNIDAD_DEFAULT_TAB;
}

const activeTab = ref<ComunidadTab>(tabFromQuery());

// Persistir la pestaña en la URL sin ensuciar el historial (replace).
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) {
    void router.replace({ query: { ...route.query, tab } });
  }
});

// Y al revés: un enlace o el botón "atrás" que cambian `?tab=` cambian la pestaña.
watch(
  () => route.query.tab,
  () => {
    const fromQuery = tabFromQuery();
    if (fromQuery !== activeTab.value) activeTab.value = fromQuery;
  }
);
</script>
