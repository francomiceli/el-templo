<template>
  <CqScreen class="cq-blocked">
    <figure class="cq-dark cq-blocked__frame">
      <img
        class="cq-blocked__cover"
        src="/conquer/portada.jpg"
        alt="Portada de Conquer, calisthenics heavy duty: silueta de un atleta contra el sol, entre templos griegos y nubes. Lográ tu mejor físico construyendo músculo con calistenia. Método exclusivo de El Templo."
      />
    </figure>
    <div class="cq-blocked__intro">
      <p class="cq-kicker">Conquer</p>
      <p class="cq-block-title">Modo premium</p>
    </div>
    <CqButton
      v-if="!requested"
      :label="CQ_TEXTOS.boton_bloqueado"
      :loading="store.requesting"
      @click="onRequest"
    />
    <div v-else class="cq-blocked__sent" role="status">
      <h2 class="cq-title">Ya le avisamos al equipo</h2>
      <p class="cq-sub">{{ CQ_TEXTOS.confirmacion_pedido }}</p>
    </div>
  </CqScreen>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuasar } from 'quasar'
import { useConquerStore } from '../stores/conquerStore'
import { CQ_TEXTOS } from '../utils/format'
import CqScreen from './brand/CqScreen.vue'
import CqButton from './brand/CqButton.vue'

// Fase 201 D-12, §7.1 Bloqueado: portada + "Quiero desbloquearlo". El pedido lo registra el API
// (idempotente, T-201-77); acá el botón va con `:loading` para no mandar dos. Con el pedido
// enviado (`status = pedido`) el botón se reemplaza por "Ya le avisamos al equipo" (D-12) y, debajo,
// la confirmación del anexo §9 (`confirmacion_pedido`). Fase 201 DA-16: la portada va enmarcada en la
// pieza oscura (`.cq-dark`) y el resto es claro, con la página del app.
const $q = useQuasar()
const store = useConquerStore()

const requested = computed(() => store.state?.status === 'pedido')

async function onRequest(): Promise<void> {
  const ok = await store.requestUnlock()
  if (!ok && store.error) $q.notify({ type: 'negative', message: store.error })
}
</script>

<style scoped lang="scss">
// La portada enmarcada (radio 20, padding 6): la pieza oscura de Bloqueado
.cq-blocked__frame {
  margin: 0;
  padding: 6px;
  border-radius: 20px;
}

.cq-blocked__cover {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 16px;
}

.cq-blocked__intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cq-blocked__sent {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
