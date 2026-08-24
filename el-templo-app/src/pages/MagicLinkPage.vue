<template>
  <!--
    Aterrizaje del magic link (`/r/trial?t=...&d=...`, Phase 180, D-03).
    Nunca renderiza el token ni un estado de error — solo el loader mientras
    canjea, después navega (D-05: un link vencido cae al login, no a una
    pantalla de error).
  -->
  <q-page class="magic-link-page" padding>
    <div class="magic-link-page__loading">
      <TemploLoader size="lg" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TemploLoader from 'src/components/TemploLoader.vue'
import { useMagicLink, resolveMagicLinkRoute } from 'src/composables/useMagicLink'
import { useNotificationStore } from 'src/stores/useNotificationStore'

const route = useRoute()
const router = useRouter()
const { exchange, cleanup } = useMagicLink()

/**
 * Camino de degradación (D-05): NUNCA una pantalla de error. El destino
 * pendiente se resuelve por el mismo mecanismo que ya usa el listener nativo
 * de deep links (`useNotificationStore().setPendingRoute`), a partir del
 * hint `?d=` — validado contra `MAGIC_LINK_ROUTE_BY_DESTINATION` (clave
 * desconocida ⇒ fallback fijo, anti open-redirect T-180-51). `router.replace`
 * (no `push`): el historial no debe volver a una URL con el token.
 */
async function degrade(): Promise<void> {
  const hint = route.query.d
  const destinationHint = typeof hint === 'string' ? hint : ''
  useNotificationStore().setPendingRoute(resolveMagicLinkRoute(destinationHint))
  await router.replace('/login')
}

onMounted(async () => {
  const tokenParam = route.query.t
  const token = typeof tokenParam === 'string' ? tokenParam : ''

  if (!token) {
    await degrade()
    return
  }

  const result = await exchange(token)
  if (result.ok) {
    await router.replace(resolveMagicLinkRoute(result.destination))
  } else {
    await degrade()
  }
})

onBeforeUnmount(() => cleanup())
</script>

<style lang="scss" scoped>
.magic-link-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.magic-link-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
