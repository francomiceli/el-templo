<template>
  <!-- Fase 214 (plan 25): hoja "Quiénes van" (UI-SPEC Pantallas 3b y 3c, D-51, D-52, D-65). Dibuja
       lo que manda el servidor, en su orden: la app no reordena ni filtra (D-03, D-17). La lista
       vive solo en el estado de este componente y se descarta al cerrar (T-214-25-01). La vista de
       una foto y "Reportar foto" (plan 26) se montan una sola vez abajo, como `AttendeePhotoDialog`. -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    :transition-duration="dialogDuration"
    aria-labelledby="attendees-sheet-title"
    @update:model-value="onUpdateModelValue"
  >
    <q-card v-if="schedule" class="ash" :style="swipe.cardStyle.value">
      <div class="ash__grab" aria-hidden="true" v-on="swipe.handlers" />

      <!-- Cabecera fija -->
      <div class="ash__head" v-on="swipe.handlers">
        <p class="ash__kicker">QUIÉNES VAN</p>
        <h3 id="attendees-sheet-title" class="ash__title">{{ title }}</h3>
        <p class="ash__sub">
          <template v-if="status === 'loading'">
            <q-skeleton
              :animation="skeletonAnimation"
              type="text"
              width="28px"
              height="13px"
              aria-hidden="true"
            />
            <span>de {{ schedule.maxCapacity }} lugares · {{ schedule.activityName }}</span>
          </template>
          <span v-else-if="data"
            >{{ data.total }} de {{ schedule.maxCapacity }} lugares ·
            {{ schedule.activityName }}</span
          >
          <span v-else>{{ schedule.maxCapacity }} lugares · {{ schedule.activityName }}</span>
        </p>
      </div>

      <!-- Cuerpo (scroll) -->
      <div class="ash__body">
        <!-- Cargando: 8 celdas de esqueleto -->
        <div
          v-if="status === 'loading'"
          class="ash__grid"
          role="status"
          aria-busy="true"
          aria-label="Cargando quiénes van"
        >
          <div v-for="n in 8" :key="n" class="ash__cell" aria-hidden="true">
            <q-skeleton :animation="skeletonAnimation" type="circle" size="56px" />
            <q-skeleton :animation="skeletonAnimation" type="rect" width="48px" height="13px" />
          </div>
        </div>

        <!-- Error de red o 5xx -->
        <div v-else-if="status === 'error'" class="ash__state" role="alert">
          <q-icon name="cloud_off" size="32px" class="ash__state-icon" aria-hidden="true" />
          <p class="ash__text">No pudimos cargar quiénes van.</p>
          <q-btn
            unelevated
            no-caps
            class="ash__btn ash__btn--secondary ash__btn--inline"
            label="Reintentar"
            @click="load"
          />
        </div>

        <!-- 404: el horario ya no existe (el pie dice "Cerrar") -->
        <div v-else-if="status === 'notfound'" class="ash__state">
          <p class="ash__text">Este horario ya no está disponible.</p>
        </div>

        <template v-else-if="data">
          <!-- Quien mira está oculto o no tiene plan: solo el número -->
          <div v-if="!data.canSeeList" class="ash__notice ash__notice--muted">
            <q-icon
              :name="data.reason === 'oculto' ? 'visibility_off' : 'lock'"
              size="22px"
              class="ash__notice-icon"
              aria-hidden="true"
            />
            <div>
              <p class="ash__text ash__text--soft">{{ hiddenNoticeText(data) }}</p>
              <button
                v-if="data.reason === 'oculto'"
                type="button"
                class="ash__link ash__link--btn"
                @click="goToProfile"
              >
                Cambialo en Perfil
              </button>
            </div>
          </div>

          <!-- Nadie anotado (carrera con la grilla) -->
          <div v-else-if="data.total === 0" class="ash__state">
            <h4 class="ash__empty-title">Todavía no hay nadie anotado</h4>
            <p class="ash__text">Reservá y sé el primero.</p>
          </div>

          <template v-else>
            <!-- Nota de primera vez (D-05) -->
            <div v-if="showNotice" class="ash__notice ash__notice--first" role="note">
              <p class="ash__text">
                Tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura también aparecen en
                esta lista para tus compañeros.
              </p>
              <!-- Texto 2 (revisión 2026-11-18): "Entendido" es el botón primario de ancho completo;
                   "Ocultarme" queda como texto subrayado y chico debajo. -->
              <q-btn
                unelevated
                no-caps
                class="ash__btn ash__btn--notice"
                label="Entendido"
                @click="dismissNotice"
              />
              <div class="ash__notice-links">
                <button
                  type="button"
                  class="ash__link ash__link--small ash__link--btn"
                  @click="hideMe"
                >
                  Ocultarme
                </button>
              </div>
            </div>

            <div class="ash__grid" role="list" aria-label="Anotados">
              <div
                v-for="(a, i) in data.attendees"
                :key="i"
                class="ash__cell"
                role="listitem"
                :aria-label="isTappable(a) ? undefined : attendeeAriaLabel(a)"
              >
                <button
                  v-if="isTappable(a)"
                  type="button"
                  class="ash__cell-btn"
                  :aria-label="`Ver la foto de ${attendeeName(a)}`"
                  @click="openPhoto(a)"
                >
                  <MemberAvatar
                    :size="56"
                    :url="a.photoUrl"
                    :first-name="a.firstName"
                    :last-initial="a.lastInitial"
                  />
                  <span class="ash__name">{{ attendeeName(a) }}</span>
                  <span class="ash__aura-row">
                    <span v-if="a.aura !== null" class="ash__aura">
                      <span class="ash__spark" aria-hidden="true">✦</span>{{ formatAura(a.aura) }}
                    </span>
                  </span>
                </button>
                <template v-else>
                  <MemberAvatar
                    :size="56"
                    :url="a.photoUrl"
                    :first-name="a.firstName"
                    :last-initial="a.lastInitial"
                  />
                  <span class="ash__name">{{ attendeeName(a) }}</span>
                  <span class="ash__aura-row" aria-hidden="true">
                    <span v-if="a.aura !== null" class="ash__aura">
                      <span class="ash__spark">✦</span>{{ formatAura(a.aura) }}
                    </span>
                  </span>
                </template>
              </div>

              <!-- Ocultos: siempre la última celda -->
              <div
                v-if="data.hiddenCount > 0"
                class="ash__cell"
                role="listitem"
                :aria-label="`y otros ${data.hiddenCount} más`"
              >
                <span class="ash__hidden-circle" aria-hidden="true">+{{ data.hiddenCount }}</span>
                <span class="ash__name ash__name--soft" aria-hidden="true">más</span>
                <span class="ash__aura-row" aria-hidden="true" />
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- Pie fijo -->
      <div class="ash__foot">
        <q-btn
          unelevated
          no-caps
          class="ash__btn"
          :class="{ 'ash__btn--secondary': footer.kind !== 'reserve' }"
          :label="footer.label"
          @click="onFooter"
        />
      </div>
    </q-card>
  </q-dialog>

  <AttendeePhotoDialog v-model="photoOpen" :attendee="photoAttendee" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import AttendeePhotoDialog from 'src/components/AttendeePhotoDialog.vue'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import { useBackButtonClose } from 'src/composables/useBackButtonClose'
import { useCommunityApi } from 'src/composables/useCommunityApi'
import { useSheetSwipeDismiss } from 'src/composables/useSheetSwipeDismiss'
import { useUserStore } from 'src/stores/useUserStore'
import {
  attendeeAriaLabel,
  attendeeName,
  sheetFooterAction,
  sheetTitle,
  type AttendeesSheetSlot,
} from 'src/utils/attendees-view'
import { formatAura } from 'src/utils/aura-format'
import { createLogger } from 'src/utils/logger'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import type { Attendee, SlotAttendees } from 'src/types/community'

const props = defineProps<{
  modelValue: boolean
  schedule: AttendeesSheetSlot | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** "Reservar" o "Anotarme en la lista de espera": la página corre su propio `onSlotTap`. */
  reserve: []
  /** Cara tocable abierta: aviso para quien necesite saberlo (el diálogo lo monta esta hoja). */
  'open-photo': [attendee: Attendee]
}>()

const log = createLogger('AttendeesSheet')
const router = useRouter()
const userStore = useUserStore()
const community = useCommunityApi()
const backClose = useBackButtonClose(close)
// Arrastrar la hoja hacia abajo la cierra (la rayita y la cabecera son la zona de arrastre).
const swipe = useSheetSwipeDismiss({
  isOpen: () => props.modelValue,
  canDismiss: () => true,
  onDismiss: close,
})

// Movimiento reducido: la hoja aparece sin transición y los esqueletos no pulsan.
const dialogDuration = prefersReducedMotion() ? 0 : 280
const skeletonAnimation = prefersReducedMotion() ? 'none' : 'pulse'

const status = ref<'loading' | 'ready' | 'notfound' | 'error'>('loading')
const data = ref<SlotAttendees | null>(null)
const noticeClosed = ref(false)
const photoOpen = ref(false)
const photoAttendee = ref<Attendee | null>(null)

/** Cada apertura o reintento invalida las respuestas en vuelo de la anterior. */
let requestSeq = 0

const title = computed(() =>
  props.schedule ? sheetTitle(props.schedule.date, props.schedule.startTime) : '',
)

const footer = computed(() => {
  if (!props.schedule) return { kind: 'close' as const, label: 'Cerrar' }
  // Sin horario (404) no hay nada que reservar.
  if (status.value === 'notfound') return { kind: 'close' as const, label: 'Cerrar' }
  return sheetFooterAction(props.schedule.footer)
})

const showNotice = computed(
  () =>
    !!data.value && data.value.canSeeList && !data.value.viewer.noticeSeen && !noticeClosed.value,
)

/** Solo las caras con foto aprobada de otra persona abren la vista de la foto. */
function isTappable(a: Attendee): boolean {
  return a.photoId !== null && !a.isMe
}

/** Textos exactos de la nota cuando no se ve la lista (UI-SPEC 3c): oculto o sin plan vigente. */
function hiddenNoticeText(d: SlotAttendees): string {
  if (d.reason === 'oculto') {
    return `Estás oculto en las listas, por eso ves solo el número: hay ${d.total} anotados.`
  }
  return `Hay ${d.total} anotados. La lista con nombres la ven los alumnos con plan vigente.`
}

function openPhoto(a: Attendee): void {
  photoAttendee.value = a
  photoOpen.value = true
  emit('open-photo', a)
}

function close(): void {
  emit('update:modelValue', false)
}

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404
}

async function load(): Promise<void> {
  const sched = props.schedule
  if (!sched) return
  const mine = ++requestSeq
  status.value = 'loading'
  data.value = null
  noticeClosed.value = false
  try {
    const result = await community.getSlotAttendees(sched.scheduleId, sched.date)
    if (mine !== requestSeq) return
    data.value = result
    status.value = 'ready'
  } catch (err: unknown) {
    if (mine !== requestSeq) return
    if (isNotFound(err)) {
      status.value = 'notfound'
      return
    }
    log.error('No se pudo cargar quiénes van', {
      error: err instanceof Error ? err.message : String(err),
    })
    status.value = 'error'
  }
}

/** Marca el aviso como visto. Si falla, el aviso vuelve la próxima vez: no se frena al usuario. */
async function markNoticeSeen(): Promise<void> {
  try {
    await community.markNoticeSeen()
    userStore.setCommunityNoticeSeen()
  } catch (err: unknown) {
    log.error('No se pudo marcar el aviso de la comunidad como visto', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function dismissNotice(): Promise<void> {
  noticeClosed.value = true
  await markNoticeSeen()
}

async function hideMe(): Promise<void> {
  close()
  void router.push({ path: '/profile', hash: '#comunidad' })
  await markNoticeSeen()
}

function goToProfile(): void {
  close()
  void router.push({ path: '/profile', hash: '#comunidad' })
}

function onFooter(): void {
  const kind = footer.value.kind
  close()
  if (kind !== 'close') emit('reserve')
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void backClose.attach()
      void load()
    } else {
      // Invalida lo que esté en vuelo, descarta la lista y suelta el botón atrás.
      requestSeq++
      data.value = null
      photoOpen.value = false
      photoAttendee.value = null
      backClose.cleanup()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  swipe.cleanup()
  requestSeq++
  data.value = null
  backClose.cleanup()
  community.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.ash {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  margin: 0 auto;
  background: $pd-light-surface;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -10px 40px rgba(44, 35, 24, 0.3);
  font-family: 'Geologica', sans-serif;
  color: $pd-ink;

  &__grab {
    @include pd-sheet-drag-handle;
    flex: none;
    align-self: center;
    width: 40px;
    height: 4px;
    margin: 8px auto 4px;
    border-radius: 2px;
    background: #d9cfc1;
  }

  &__head {
    @include pd-sheet-drag-head;
    flex: none;
    padding: 4px 20px 16px;
  }

  &__kicker {
    @include pd-kicker-light;
  }

  &__title {
    margin: 4px 0 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__sub {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: $pd-ink-2;
  }

  &__total-skel {
    display: inline-block;
  }

  &__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 0 20px 8px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px 8px;
    padding: 8px 0;
  }

  &__cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  // Celda con foto: botón que ocupa toda la celda (tocable de 44 o más: la cara mide 56).
  &__cell-btn {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 2px;
      border-radius: 12px;
    }
  }

  // Hasta dos renglones (2026-11-20): en una columna de ~75 px "Maximiliano R." no entraba en uno y
  // no había dónde leerlo completo. Corta entre palabras; una palabra que sola no entra se parte.
  // Los "…" quedan solo para un nombre que no entra ni en dos.
  &__name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    max-width: 100%;
    overflow: hidden;
    overflow-wrap: anywhere;
    text-align: center;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.3;
    color: $pd-ink;

    &--soft {
      color: $pd-ink-2;
    }
  }

  // Fila de puntos: alto fijo para que los nombres queden alineados con o sin pastilla. Va pegada
  // abajo de la celda: si un nombre de la fila ocupa dos renglones, las pastillas siguen parejas.
  &__aura-row {
    display: flex;
    margin-top: auto;
    align-items: center;
    justify-content: center;
    min-height: 20px;
  }

  &__aura {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: $pd-gold-tint;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: $pd-gold-ink;
  }

  &__spark {
    color: $pd-gold;
  }

  &__hidden-circle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #e9e1d5;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    color: $pd-ink-2;
  }

  &__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 0 24px;
    text-align: center;
  }

  &__state-icon {
    color: $pd-ink-2;
  }

  &__empty-title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__text {
    margin: 8px 0 0;
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    color: $pd-ink;

    &--soft {
      margin: 0;
      color: $pd-ink-2;
    }
  }

  &__notice {
    padding: 16px;
    margin: 8px 0;
    border-radius: 12px;

    &--first {
      background: #fff7ea;
      border: 1px solid #ecd9b8;

      .ash__text {
        margin: 0;
      }
    }

    &--muted {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #f3ede4;
    }
  }

  &__notice-icon {
    flex: none;
    color: $pd-terra-ink;
  }

  &__notice-links {
    display: flex;
    justify-content: center;
    margin-top: 4px;
  }

  &__link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 400;
    color: $pd-terra-ink;
    text-decoration: underline;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 2px;
      border-radius: 4px;
    }

    &--small {
      font-size: 13px;
    }

    &--btn {
      padding: 0;
      border: 0;
      background: transparent;
    }
  }

  &__foot {
    flex: none;
    padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid $pd-light-line;
  }

  &__btn {
    @include pd-cta(48px);

    &--secondary {
      @include pd-cta-secondary-light;
    }

    &--inline {
      width: auto;
      margin-top: 16px;
    }

    // Botón "Entendido" del aviso de la primera vez: ancho completo, bajo el texto.
    &--notice {
      width: 100%;
      margin-top: 12px;
    }
  }
}
</style>
