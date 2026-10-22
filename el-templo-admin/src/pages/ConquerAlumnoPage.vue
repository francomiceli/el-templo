<!-- Ficha del alumno de Conquer (fase 201, §7.2, D-08): su Progreso con corrección de progresiones,
     incremento, nivel y días. 201-22 suma, en este orden, las acciones sobre alertas y la
     Evolución. La ficha y el catálogo (opciones de peldaño por escalera) se piden juntos; cada acción
     del coach devuelve la ficha completa y reemplaza el estado de la pantalla. 404/409 (alumno
     ajeno, sin Conquer o todavía un pedido) avisan y vuelven al tablero. El gate real es el API. -->
<template>
  <q-page padding>
    <q-btn
      flat
      no-caps
      icon="arrow_back"
      label="Volver a Conquer"
      class="q-mb-md"
      data-test="conquer-ficha-back"
      @click="goBack"
    />

    <div v-if="loading && !ficha" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError && !ficha" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <template v-else-if="ficha && catalog">
      <div class="q-mb-md">
        <ConquerMemberHeader :member="ficha.member" @saved="reloadFicha" />
      </div>

      <ConquerProgressTable :ficha="ficha" :catalog="catalog" @updated="onFichaUpdated" />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import ConquerMemberHeader from 'src/components/conquer/ConquerMemberHeader.vue';
import ConquerProgressTable from 'src/components/conquer/ConquerProgressTable.vue';
import { ConquerApiError, useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminCatalog, FichaResponse } from 'src/types/conquer';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const conquerApi = useConquerAdminApi();

const ficha = ref<FichaResponse | null>(null);
const catalog = ref<AdminCatalog | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);

function currentUserId(): number | null {
  const raw = route.params.userId;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function goBack(): void {
  void router.push({ name: 'conquer' });
}

// 404 (no es de este gimnasio o no tiene Conquer) y 409 (todavía es un pedido): se avisa y se
// vuelve al tablero. Cualquier otro error deja la pantalla con "Reintentar".
function isGoneError(err: unknown): boolean {
  return err instanceof ConquerApiError && (err.status === 404 || err.status === 409);
}

async function load(): Promise<void> {
  const userId = currentUserId();
  if (userId === null) {
    $q.notify({ type: 'negative', message: 'Alumno inválido' });
    goBack();
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    const [loadedFicha, loadedCatalog] = await Promise.all([
      conquerApi.getFicha(userId),
      conquerApi.getCatalog(),
    ]);
    ficha.value = loadedFicha;
    catalog.value = loadedCatalog;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos cargar la ficha del alumno';
    $q.notify({ type: 'negative', message });
    if (isGoneError(err)) {
      goBack();
      return;
    }
    loadError.value = message;
  } finally {
    loading.value = false;
  }
}

/** Relee solo la ficha (después de guardar nivel o días: pueden aparecer escalones nuevos). */
async function reloadFicha(): Promise<void> {
  const userId = currentUserId();
  if (userId === null) return;
  try {
    ficha.value = await conquerApi.getFicha(userId);
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos actualizar la ficha',
    });
  }
}

function onFichaUpdated(updated: FichaResponse): void {
  ficha.value = updated;
}

onMounted(load);

// Navegar de una ficha a otra reutiliza el componente: se relee todo.
watch(
  () => route.params.userId,
  () => {
    if (route.name !== 'conquer-alumno') return;
    ficha.value = null;
    void load();
  }
);
</script>
