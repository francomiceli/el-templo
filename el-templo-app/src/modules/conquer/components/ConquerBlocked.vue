<template>
  <CqSky class="cq-blocked">
    <img
      class="cq-blocked__cover"
      src="/conquer/portada.jpg"
      alt="Portada de Conquer, calisthenics heavy duty: silueta de un atleta contra el sol, entre templos griegos y nubes. Lográ tu mejor físico construyendo músculo con calistenia. Método exclusivo de El Templo."
    />
    <div class="cq-blocked__premium">
      <div class="cq-caps cq-rule cq-blocked__caps">Modo premium</div>
    </div>
    <CqCloudButton
      v-if="!requested"
      plain
      :label="CQ_TEXTOS.boton_bloqueado"
      :loading="store.requesting"
      @click="onRequest"
    />
    <div v-else class="cq-foot cq-foot--plain">
      <div class="cq-toast" role="status">Ya le avisamos al equipo</div>
      <div class="cq-sub">{{ CQ_TEXTOS.confirmacion_pedido }}</div>
    </div>
  </CqSky>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuasar } from 'quasar'
import { useConquerStore } from '../stores/conquerStore'
import { CQ_TEXTOS } from '../utils/format'
import CqSky from './brand/CqSky.vue'
import CqCloudButton from './brand/CqCloudButton.vue'

// Fase 201 D-12, §7.1 Bloqueado: portada + "Quiero desbloquearlo". El pedido lo registra el API
// (idempotente, T-201-77); acá el botón va con `:loading` para no mandar dos. Con el pedido
// enviado (`status = pedido`) el botón se reemplaza por "Ya le avisamos al equipo" (D-12) y, debajo,
// la confirmación del anexo §9 (`confirmacion_pedido`).
const $q = useQuasar()
const store = useConquerStore()

const requested = computed(() => store.state?.status === 'pedido')

async function onRequest(): Promise<void> {
  const ok = await store.requestUnlock()
  if (!ok && store.error) $q.notify({ type: 'negative', message: store.error })
}
</script>

<style scoped lang="scss">
// La portada sangra hasta los bordes y el pie de nubes queda pegado abajo (prototipo `.screen.flush`)
.cq-blocked.cq-sky {
  padding: 0;
  gap: 0;
}

.cq-blocked__cover {
  display: block;
  width: 100%;
  height: auto;
}

// El rótulo va sobre el blanco del pie (continúa el borde de nubes de la portada): en tinta, no en crema
.cq-blocked__premium {
  padding: 14px var(--cq-pad-x) 0;
  background: var(--cq-cloud);
}

.cq-blocked .cq-blocked__caps {
  color: var(--cq-ink2);
}
</style>
