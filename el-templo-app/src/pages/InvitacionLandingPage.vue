<!-- Landing del link de invitación `/invitacion/:code` (Fase 194, D-06). Pública (auth-agnóstica en el guard).
     T-194-86: SIN sesión no se consulta nada del invitador (ni nombre ni cantidades): el copy es genérico para que
     el link no sirva para enumerar códigos. El nombre y los accesos aparecen recién en "Activar invitación", ya
     autenticado y con los valores que manda el servidor. -->
<template>
  <q-layout>
    <q-page-container>
      <q-page class="invitacion-page" :style-fn="() => ({ minHeight: '100vh' })">
        <div class="invitacion-container">
          <img src="/logo.webp" alt="El Templo" class="logo-img" />

          <p class="brand-welcome">Bienvenido al Templo</p>

          <div class="invitacion-card">
            <p class="invitacion-headline" data-test="landing-copy">
              Te invitaron a entrenar en El Templo: tenés accesos gratis para probar
            </p>
            <p class="invitacion-note">
              Creá tu cuenta o ingresá con la que ya tenés para activar tu invitación.
            </p>

            <q-btn
              class="full-width enter-btn"
              unelevated
              no-caps
              label="Crear cuenta"
              :to="registerTo"
            />
            <q-btn
              class="full-width q-mt-sm"
              flat
              no-caps
              color="white"
              label="Ya tengo cuenta"
              :to="loginTo"
            />
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useAuthStore } from 'stores/useAuthStore'
import { normalizeInvitationCode, pendingInvitation } from 'src/utils/pending-invitation'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// null si el código del link no tiene formato de código: los botones siguen llevando a registro/login
// (sin código) y nada se guarda.
const code = computed(() => normalizeInvitationCode(route.params.code))

const registerTo = computed<RouteLocationRaw>(() =>
  code.value
    ? { path: '/register', query: { code: code.value, invitacion: '1' } }
    : { path: '/register' },
)
const loginTo = computed<RouteLocationRaw>(() =>
  code.value ? { path: '/login', query: { invitacion: code.value } } : { path: '/login' },
)

onMounted(() => {
  if (code.value) pendingInvitation.save(code.value)
  // Con sesión iniciada no hay nada que decidir acá: directo a "Activar invitación".
  if (authStore.isAuthenticated) {
    void router.replace({ name: 'activar-invitacion' })
  }
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;
$charcoal-mid: #3d3732;

.invitacion-page {
  background-color: $charcoal !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.invitacion-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
}

.logo-img {
  width: 120px;
  height: auto;
  display: block;
  margin-bottom: 12px;
}

.brand-welcome {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.35rem;
  letter-spacing: 0.08em;
  color: $cream;
  margin: 0 0 24px;
  text-align: center;
}

.invitacion-card {
  width: 100%;
  background: rgba($charcoal-mid, 0.85);
  border-top: 2px solid rgba($terracotta, 0.6);
  border-radius: 8px;
  padding: 28px 24px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.invitacion-headline {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
  color: $cream;
  margin: 0 0 12px;
  text-align: center;
}

.invitacion-note {
  font-size: 0.85rem;
  line-height: 1.5;
  color: rgba($cream, 0.6);
  margin: 0 0 24px;
  text-align: center;
}

.enter-btn {
  background: linear-gradient(135deg, $terracotta 0%, #855038 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 6px;
}
</style>
