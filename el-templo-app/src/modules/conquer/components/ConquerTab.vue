<template>
  <ConquerHome v-if="store.view === 'inicio'" />
  <ConquerBlocked v-else-if="store.view === 'bloqueado' || store.view === 'pedido'" />
  <CqSky v-else class="cq-tab">
    <div v-if="store.error" class="cq-tab__center" role="alert">
      <p class="cq-display cq-tab__title">Conquer</p>
      <p class="cq-sub">{{ store.error }}</p>
    </div>
    <div v-else class="cq-tab__center" role="status" aria-live="polite">
      <span class="cq-tab__spin" aria-hidden="true" />
      <span class="cq-sub">Cargando Conquer</span>
    </div>
    <CqCloudButton
      v-if="store.error"
      label="Reintentar"
      :loading="store.loading"
      @click="store.loadState()"
    />
  </CqSky>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import ConquerBlocked from './ConquerBlocked.vue'
import ConquerHome from './ConquerHome.vue'
import CqSky from './brand/CqSky.vue'
import CqCloudButton from './brand/CqCloudButton.vue'

// Fase 201 D-12, D-17, §7.1: raíz de la tab Conquer. Pide el estado al montar y pinta la pantalla
// que corresponde (`resolveConquerView`): Bloqueado/pedido, el control del día 0 o Inicio. Cada pantalla trae su propio
// `CqSky` (tokens `--cq-*` solo adentro de Conquer, D-09). Se carga con `defineAsyncComponent`
// desde Entrenar y la vidriera: la fuente y el CSS quedan en el chunk de Conquer.
const store = useConquerStore()
const router = useRouter()

// D-15: la primera vez que entra, lo primero que ve el alumno activo es el control físico. `replace`
// para que el atrás no vuelva a la tab (que lo mandaría de nuevo al control).
watch(
  () => store.view,
  (view) => {
    if (view === 'dia0') void router.replace({ name: 'conquer-control', query: { dia0: '1' } })
  },
  { immediate: true },
)

onMounted(() => {
  void store.loadState()
})

onUnmounted(() => {
  store.cleanup()
})
</script>

<style scoped lang="scss">
.cq-tab.cq-sky {
  min-height: 60vh;
}

.cq-tab__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
  text-align: center;
}

.cq-tab__title {
  margin: 0;
  font-size: 30px;
}

.cq-tab__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--cq-gold);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-tab__spin {
    animation: cq-tab-spin 0.8s linear infinite;
  }
}

@keyframes cq-tab-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
