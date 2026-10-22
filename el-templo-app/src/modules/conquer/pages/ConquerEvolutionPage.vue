<template>
  <CqScreen class="cq-evo">
    <CqPageHeader
      title="Antes y después"
      subtitle="Día 0 contra el último control"
      :back-to="BACK_TO"
      back-label="Volver al inicio de Conquer"
    />

    <div v-if="loading || loadError" class="cq-evo__center" role="status" aria-live="polite">
      <template v-if="loadError">
        <p class="cq-notice" role="alert">{{ loadError }}</p>
        <CqButton label="Reintentar" variant="secondary" small @click="reload" />
      </template>
      <template v-else>
        <span class="cq-evo__spin" aria-hidden="true" />
        <span class="cq-sub">Cargando tu evolución</span>
      </template>
    </div>

    <template v-else-if="list">
      <CqCompare v-if="pair" :compare="pair.compare" :from-check="pair.from" :to-check="pair.to" />
      <div v-else class="cq-evo__next cq-card" role="status">
        <p>{{ nextControlText(list.due.nextDueDate) }}</p>
        <p class="cq-sub">Con dos controles vas a ver tu antes y después acá.</p>
      </div>

      <h2 class="cq-block-title">Publicación</h2>
      <CqPublishPermission
        :enabled="member?.publishEnabled ?? false"
        :no-face="member?.publishNoFace ?? false"
        @saved="store.applyPublishPermission"
      />

      <div v-if="canDoCheck" class="cq-evo__foot">
        <p v-if="list.due.due" class="cq-sub">Toca tu control físico</p>
        <CqButton label="Hacer el control" variant="secondary" @click="goCheck" />
      </div>
    </template>
  </CqScreen>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { ConquerApiError, isConquerCanceled, useConquerApi } from '../composables/useConquerApi'
import { hasContent, nextControlText } from '../utils/bodyCheck'
import type { BodyCheckView, BodyChecksResponse, CheckComparison } from '../types'
import CqScreen from '../components/brand/CqScreen.vue'
import CqPageHeader from '../components/brand/CqPageHeader.vue'
import CqButton from '../components/brand/CqButton.vue'
import CqCompare from '../components/evolution/CqCompare.vue'
import CqPublishPermission from '../components/evolution/CqPublishPermission.vue'

// Fase 201 §6, §7.1 Evolución: día 0 contra el último control, con la diferencia de cada medida, y
// el permiso de publicación (con "sin cara") que el alumno puede retirar. Lee `GET /body-checks`:
// el par y las diferencias las arma el API. Con un solo control avisa cuándo toca el próximo. Las
// URLs firmadas las pide cada foto al mostrarse; esta pantalla no las guarda ni las loguea.
const BACK_TO = { path: '/training', query: { tab: 'conquer' } }

const router = useRouter()
const store = useConquerStore()
const api = useConquerApi()

const loading = ref(true)
const loadError = ref<string | null>(null)
const list = ref<BodyChecksResponse | null>(null)

const member = computed(() => store.state?.member ?? null)

interface Pair {
  compare: CheckComparison
  from: BodyCheckView
  to: BodyCheckView
}

const pair = computed<Pair | null>(() => {
  const data = list.value
  if (!data?.compare) return null
  const from = data.checks.find((c) => c.id === data.compare?.from.id)
  const to = data.checks.find((c) => c.id === data.compare?.to.id)
  return from && to ? { compare: data.compare, from, to } : null
})

// Hay que ofrecer el control cuando toca, o cuando todavía no hizo ninguno
const canDoCheck = computed(() => {
  const data = list.value
  if (!data) return false
  return data.due.due || !data.checks.some(hasContent)
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    if (!store.state) await store.loadState()
    if (store.view === 'bloqueado' || store.view === 'pedido') {
      await router.replace(BACK_TO)
      return
    }
    list.value = await api.listBodyChecks()
  } catch (err: unknown) {
    if (isConquerCanceled(err)) return
    loadError.value =
      err instanceof ConquerApiError
        ? err.message
        : 'No pudimos cargar tu evolución. Probá de nuevo.'
  } finally {
    loading.value = false
  }
}

function reload(): void {
  void load()
}

function goCheck(): void {
  void router.push({ name: 'conquer-control' })
}

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  api.cleanup()
})
</script>

<style scoped lang="scss">
.cq-evo {
  // Alto de la pantalla menos el header y la barra de abajo (igual que Hoy)
  min-height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
}

.cq-evo__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  text-align: center;
}

.cq-evo__spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--cq-edge-gold);
  border-right-color: transparent;
}

// `.cq-evo__next.cq-card` (dos clases en el mismo elemento) le gana al `gap: 12px` de `.cq-card`
.cq-evo__next.cq-card {
  gap: 6px;
  text-align: center;

  p {
    margin: 0;
  }
}

.cq-evo__foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
  text-align: center;
}

@media (prefers-reduced-motion: no-preference) {
  .cq-evo__spin {
    animation: cq-evo-spin 0.8s linear infinite;
  }
}

@keyframes cq-evo-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
