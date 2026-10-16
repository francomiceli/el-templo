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

          <PremiumGlassCard class="invitacion-card">
            <p class="invitacion-headline" data-test="landing-copy">
              Te invitaron a entrenar en El Templo: tenés accesos gratis para probar
            </p>
            <p class="invitacion-note">
              Creá tu cuenta o ingresá con la que ya tenés para activar tu invitación.
            </p>

            <q-btn
              class="full-width pd-cta"
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
          </PremiumGlassCard>
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
import PremiumGlassCard from 'src/components/PremiumGlassCard.vue'

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
@import 'src/css/premium-card';
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
  @include pd-screen-title;
  margin-bottom: 24px;
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
  color: $pd-cream-3;
  margin: 0 0 24px;
  text-align: center;
}
</style>
