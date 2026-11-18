<template>
  <!-- Fase 214 (plan 23): encabezado único de Mi Templo (UI-SPEC, Pantalla 1, D-25 a D-27, D-53,
       D-60, D-61, D-66). Se monta una sola vez en celular y otra en escritorio (nunca las dos): foto,
       nombre con sello, antigüedad y ficha de Aura. Sin "Hola", fecha, contador ni selector de nivel. -->
  <div class="mth">
    <!-- Cargando: esqueleto con el alto final, sin saltos (D-08) -->
    <template v-if="!profile">
      <q-skeleton animation="none" type="circle" size="52px" class="mth__sk-photo" />
      <div class="mth__text">
        <q-skeleton animation="none" type="text" class="mth__sk-name" />
        <q-skeleton animation="none" type="text" class="mth__sk-tenure" />
      </div>
      <q-skeleton animation="none" type="rect" width="80px" height="56px" class="mth__sk-chip" />
    </template>

    <template v-else>
      <button
        type="button"
        class="mth__photo"
        :aria-label="photoAriaLabel"
        @click="photoOpen = true"
      >
        <MemberAvatar
          v-if="shownUrl"
          :size="52"
          :url="shownUrl"
          :first-name="profile.firstName ?? null"
          :last-initial="lastInitial"
          :ring="auraVisible ? 'gold' : 'white'"
          :badge="pendingUrl ? 'review' : null"
          @image-error="onImageError"
        />
        <span v-else class="mth__photo-empty" aria-hidden="true">
          <q-icon name="add_a_photo" size="24px" />
        </span>
      </button>

      <div class="mth__text">
        <h1 class="mth__name">
          <span class="mth__name-text">{{ firstName }}</span>
          <VeteranSeal class="mth__seal" :since="memberSince" />
        </h1>
        <!-- #17: sin foto, la invitación a subirla; con foto (o en revisión), la antigüedad. -->
        <button
          v-if="subline?.kind === 'cta'"
          type="button"
          class="mth__cta"
          @click="photoOpen = true"
        >
          {{ subline.text }}
        </button>
        <p v-else-if="subline?.kind === 'tenure'" class="mth__tenure">{{ subline.text }}</p>
      </div>

      <AuraChip v-if="auraValue !== null" :value="auraValue" @open="auraOpen = true" />
    </template>

    <ProfilePhotoSheet v-model="photoOpen" />
    <AuraDetailSheet v-if="auraValue !== null" v-model="auraOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { formatTenure } from 'src/utils/tenure'
import { headerSubline } from 'src/utils/mi-templo-header'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import VeteranSeal from 'src/components/VeteranSeal.vue'
import AuraChip from 'src/components/AuraChip.vue'
import ProfilePhotoSheet from 'src/components/ProfilePhotoSheet.vue'
import AuraDetailSheet from 'src/components/AuraDetailSheet.vue'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()

const profile = computed(() => userStore.profile)
const photo = computed(() => profile.value?.photo ?? null)
const approvedUrl = computed(() => photo.value?.url ?? null)
const pendingUrl = computed(() => photo.value?.pendingUrl ?? null)
// Con una aprobada se muestra esa; si solo hay una pendiente, se muestra la pendiente con la insignia.
const shownUrl = computed(() => approvedUrl.value ?? pendingUrl.value)

const firstName = computed(() => profile.value?.firstName ?? 'Atleta')
const lastInitial = computed(() => profile.value?.lastName?.trim().charAt(0) ?? null)
const memberSince = computed(() => profile.value?.memberSince ?? null)
const tenure = computed(() => formatTenure(profile.value?.memberSince))

// null con el módulo apagado (o sin dato): no hay ficha y el aro de la foto es blanco.
const auraValue = computed<number | null>(() =>
  userStore.auraVisible ? (profile.value?.auraEarned ?? null) : null,
)
const auraVisible = computed(() => auraValue.value !== null)

const subline = computed(() =>
  headerSubline({
    hasShownPhoto: approvedUrl.value !== null,
    hasPendingPhoto: pendingUrl.value !== null,
    auraVisible: auraVisible.value,
    tenure: tenure.value,
  }),
)

const photoAriaLabel = computed(() => {
  if (approvedUrl.value && pendingUrl.value) {
    return 'Tu foto de perfil. Tenés una foto nueva en revisión'
  }
  if (approvedUrl.value) return 'Tu foto de perfil'
  if (pendingUrl.value) return 'Tu foto está en revisión'
  return 'Subí tu foto de perfil'
})

const photoOpen = ref(false)
const auraOpen = ref(false)

// Fase 215: destino de la push y del aviso de un regalo (`/mi-templo?aura=detalle`). Solo se reconoce
// el valor exacto `detalle` y solo abre el detalle PROPIO de Aura (T-215-21-01). Con el módulo apagado
// (`auraValue` null) no se abre nada y el socio queda en Mi Templo. El parámetro se limpia siempre,
// conservando el resto de la consulta y el hash. Se espera a que haya perfil: sin él todavía no se
// sabe si el módulo está prendido y limpiar antes haría perder el aviso. Funciona al montar y si el
// parámetro llega con la página ya montada (watch inmediato).
watch(
  () => [route.query.aura, profile.value !== null] as const,
  ([aura, hasProfile]) => {
    if (aura !== 'detalle' || !hasProfile) return
    if (auraValue.value !== null) auraOpen.value = true
    const query = { ...route.query }
    delete query.aura
    void router.replace({ path: route.path, query, hash: route.hash })
  },
  { immediate: true },
)

// URL firmada vencida (Pitfall 9): se vuelve a pedir `/me` UNA sola vez; después quedan las
// iniciales (T-214-23-01). Si la foto cambia y vuelve a fallar, no se insiste.
let refetchedOnce = false

function onImageError(): void {
  if (refetchedOnce) return
  refetchedOnce = true
  void userStore.refreshProfile()
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.mth {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px 16px;
  border-radius: inherit;
  background: linear-gradient(135deg, $brand-terracotta 0%, $brand-aged-gold 100%);

  &__photo {
    flex: none;
    // El aro dorado/blanco sale 4 px afuera de la foto: no cuenta para el área tocable (52).
    position: relative;
    width: 52px;
    height: 52px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 6px;
    }
  }

  &__photo-empty {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border: 2px dashed rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    box-sizing: border-box;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__name {
    display: flex;
    align-items: center;
    min-width: 0;
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.2;
    color: #fff;
  }

  &__name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tenure {
    margin: 2px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.3;
    color: #fff;
  }

  // #17: invitación a subir la foto. Se ve como la línea de antigüedad pero subrayada; el área
  // tocable llega a 44 px con padding y margen negativo, sin agrandar el encabezado.
  &__cta {
    display: block;
    max-width: 100%;
    margin: -12px 0 -14px;
    padding: 14px 0;
    border: 0;
    background: none;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    color: #fff;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
  }

  // Esqueletos (D-08): anchos fijos con tope al ancho disponible para que a 360 px nada desborde.
  &__sk-photo {
    flex: none;
  }

  &__sk-name {
    width: 160px;
    max-width: 100%;
  }

  &__sk-tenure {
    width: 200px;
    max-width: 100%;
  }

  &__sk-chip {
    flex: none;
    border-radius: 16px;
  }
}

// El sello mide 24 (fase 215, #18) y no se recorta: pegado al nombre con margen 8. Va fuera del
// bloque `.mth` para ganar en especificidad al margen propio del sello (7).
.mth .mth__seal {
  flex: none;
  margin-left: 8px;
}
</style>
