<template>
  <div class="vidriera">
    <!-- Fase 201 D-17: las tabs quedan FUERA del fondo inert, interactivas: quien no tiene plan
         también puede abrir Conquer (pantalla Bloqueado). -->
    <EntrenarTabs v-if="ENTRENAR_TABS_ENABLED" v-model="activeTab" class="vidriera__tabs" />

    <!-- Semana: Entrenar con una plani de ejemplo FIJA (sin API), desenfocada y sin ninguna
         interacción: ni toques ni foco ni lectores de pantalla. v-if (nunca v-show): la figura
         se mide y tiene que estar visible. -->
    <div
      v-if="activeTab === 'semana'"
      :id="ENTRENAR_TABS_ENABLED ? paneId('semana') : undefined"
      :role="ENTRENAR_TABS_ENABLED ? 'tabpanel' : undefined"
      :aria-labelledby="ENTRENAR_TABS_ENABLED ? tabId('semana') : undefined"
      class="vidriera__stage"
    >
      <div class="vidriera__bg" aria-hidden="true" inert>
        <SemanaTab
          :days="days"
          :selected-date="selectedDate"
          :today="today"
          :monday="monday"
          :can-prev="false"
          :can-next="false"
          :has-progress="false"
          :gender="gender"
          :interactive="false"
        />
      </div>

      <div class="vidriera__overlay">
        <PremiumDialogCard class="vidriera__card">
          <h2 class="pd-title">Activá Tu Plan</h2>
          <p class="pd-text">
            No tenés un plan activo. Consultá por tu plan para comenzar a entrenar.
          </p>
          <div class="pd-acts">
            <q-btn unelevated no-caps class="pd-cta vidriera__wa" @click="openWhatsApp">
              <q-icon
                name="img:/icons/whatsapp.svg"
                size="18px"
                class="q-mr-sm"
                style="filter: brightness(0) invert(1)"
              />
              Consultá por tu plan
            </q-btn>
          </div>
        </PremiumDialogCard>
      </div>
    </div>

    <!-- Conquer: sin desenfoque ni tarjeta. 201-17 lo reemplaza por la tab real. -->
    <section
      v-else
      :id="paneId('conquer')"
      role="tabpanel"
      :aria-labelledby="tabId('conquer')"
      class="vidriera__pane"
    >
      <ComingSoonPane kind="conquer" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import { ENTRENAR_TABS_ENABLED } from 'src/config/featureFlags'
import { useUserStore } from 'src/stores/useUserStore'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { buildVidrieraWeek } from '../data/vidriera-sample'
import { mondayOfDate } from '../utils/weekLabels'
import { ENTRENAR_TAB_FLAGS, queryTabKeys, tabFromQuery } from '../utils/entrenarTabs'
import type { TabKey } from '../utils/entrenarTabs'
import ComingSoonPane from './ComingSoonPane.vue'
import EntrenarTabs, { paneId, tabId } from './EntrenarTabs.vue'
import SemanaTab from './semana/SemanaTab.vue'

// Fase 197 D-06: vidriera de quien no tiene plan. Se ve Entrenar (Semana con figura) desenfocado
// y no interactivo, con la tarjeta "Activá Tu Plan" (y su CTA de WhatsApp) encima. El contenido
// es una plani de ejemplo fija: sin plan no hay nivel y la API puede dar 403 (T-197-43).
// Fase 201 D-17: las tabs son interactivas y `?tab=conquer` abre la tab Conquer sin desenfoque.
const userStore = useUserStore()
const route = useRoute()

// Lista blanca (T-201-53): sin tabs todo `?tab=` abre Semana
const activeTab = ref<TabKey>(tabFromQuery(route.query.tab, queryTabKeys(ENTRENAR_TAB_FLAGS)))

const today = computed(() => todayInTz(userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ))
const monday = computed(() => mondayOfDate(today.value))
const days = computed(() => buildVidrieraWeek(monday.value, today.value))

// Siempre un día con plani: hoy, o el viernes si hoy es domingo
const selectedDate = computed(() => {
  const list = days.value
  return (list.find((d) => d.date === today.value && d.session) ?? list[4]).date
})

const gender = computed(() => userStore.profile?.gender ?? null)

function openWhatsApp(): void {
  const message = 'Hola, quiero consultar por los planes de entrenamiento'
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

// Alto de la pantalla menos el header y la barra de abajo: lo de atrás se recorta, sin scroll.
// Las tabs ocupan su alto natural y el escenario (fondo + tarjeta) el resto.
.vidriera {
  display: flex;
  flex-direction: column;
  height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
  overflow: hidden;

  @media (min-width: 768px) {
    height: var(--app-vh);
  }

  &__tabs {
    flex: none;
  }

  &__stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  // Conquer: se desplaza si el contenido no entra, sin desenfoque
  &__pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  &__bg {
    filter: blur(6px);
    pointer-events: none;
    user-select: none;
  }

  &__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  &__card {
    width: 100%;
  }

  // Verde de WhatsApp oscurecido para que el blanco llegue a AA; forma y destello son de `pd-cta`
  &__wa {
    background: linear-gradient(135deg, $pd-wa-a 0%, $pd-wa-b 100%) !important;
  }
}

// Entrada suave de la tarjeta: solo si el socio no pidió reducir el movimiento
@keyframes vidriera-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .vidriera__card {
    animation: vidriera-in 0.35s ease-out both;
  }
}
</style>
