<!-- Conquer (fase 201, §7.2, D-08/D-12): la pantalla del coach. Tres tabs — Tablero (semáforo de
     los alumnos activos), Pedidos (alumnos que pidieron el desbloqueo) y Galería (antes y después)
     — y el botón "Activar alumno" para dar de alta a cualquiera buscándolo. 201-23 suma Catálogo y
     Ajustes. El tab activo viaja en ?tab= para deep links. El gate real es el API (owner/admin). -->
<template>
  <q-page padding>
    <div class="row items-center q-mb-md q-col-gutter-sm">
      <div class="text-h5 col">Conquer</div>
      <div class="col-auto">
        <q-btn
          unelevated
          no-caps
          color="secondary"
          icon="person_add"
          label="Activar alumno"
          data-test="conquer-activate-open"
          @click="openActivate(null)"
        />
      </div>
    </div>

    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="secondary"
      indicator-color="secondary"
    >
      <q-tab name="tablero" label="Tablero" icon="monitor_heart" no-caps />
      <q-tab name="pedidos" label="Pedidos" icon="lock_open" no-caps>
        <q-badge
          v-if="adminStore.conquerRequestsCount > 0"
          color="negative"
          floating
          :label="adminStore.conquerRequestsCount"
        />
      </q-tab>
      <q-tab name="galeria" label="Galería" icon="photo_library" no-caps />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel name="tablero" class="q-pa-none">
        <ConquerBoard :reload-token="reloadToken" />
      </q-tab-panel>
      <q-tab-panel name="pedidos" class="q-pa-none">
        <ConquerRequests :reload-token="reloadToken" @activate="openActivate" />
      </q-tab-panel>
      <q-tab-panel name="galeria" class="q-pa-none">
        <ConquerGallery :reload-token="reloadToken" />
      </q-tab-panel>
    </q-tab-panels>

    <ConquerActivateDialog
      v-model="activateOpen"
      :member="activateMember"
      @activated="onActivated"
    />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConquerBoard from 'src/components/conquer/ConquerBoard.vue';
import ConquerGallery from 'src/components/conquer/ConquerGallery.vue';
import ConquerRequests from 'src/components/conquer/ConquerRequests.vue';
import ConquerActivateDialog from 'src/components/conquer/ConquerActivateDialog.vue';
import { useAdminStore } from 'src/stores/useAdminStore';

type ConquerTab = 'tablero' | 'pedidos' | 'galeria';
const TAB_NAMES: ConquerTab[] = ['tablero', 'pedidos', 'galeria'];

const route = useRoute();
const router = useRouter();
const adminStore = useAdminStore();

function tabFromQuery(): ConquerTab {
  const requested = typeof route.query.tab === 'string' ? route.query.tab : null;
  return TAB_NAMES.find((t) => t === requested) ?? 'tablero';
}

const activeTab = ref<ConquerTab>(tabFromQuery());

// Deep link: el tab activo viaja en la query (replace: sin ensuciar el historial).
watch(activeTab, (tab) => {
  if (route.query.tab === tab) return;
  void router.replace({ query: { ...route.query, tab } });
});

// Si la query cambia desde afuera (un link a ?tab=pedidos estando en la página), se sigue.
watch(
  () => route.query.tab,
  () => {
    activeTab.value = tabFromQuery();
  }
);

const activateOpen = ref(false);
const activateMember = ref<{ userId: number; name: string } | null>(null);
// Sube después de un alta: el tablero y los pedidos se releen solos.
const reloadToken = ref(0);

function openActivate(member: { userId: number; name: string } | null): void {
  activateMember.value = member;
  activateOpen.value = true;
}

function onActivated(): void {
  reloadToken.value += 1;
}

onMounted(() => {
  void adminStore.fetchConquerRequestsCount();
});
</script>
