<template>
  <!-- Fase 215 (plan 18): pantalla de Notificaciones (sketch 035 B, UI-SPEC Pantalla 4, D-17 y D-18).
       Los avisos propios agrupados por día. Revisión 2026-11-18 (#35): al entrar se marcan todos como
       leídos y la campana vuelve a 0; los que eran nuevos se ven resaltados esa vez (el resaltado se
       calcula al entrar y no depende de `readAt`). Títulos y cuerpos se interpolan como texto
       (nunca como HTML). -->
  <q-page class="notif-page">
    <div class="notif">
      <!-- 2026-11-19: el encabezado usa la misma grilla que las filas. La flecha va en un círculo
           igual al de los íconos de la lista (40, en la columna de los íconos) y el título arranca en
           la columna del texto. -->
      <header class="notif__header">
        <button type="button" class="notif__back" aria-label="Volver" @click="goBack">
          <q-icon name="arrow_back" size="20px" aria-hidden="true" />
        </button>
        <h1 class="notif__title">Notificaciones</h1>
      </header>

      <!-- Cargando: seis filas de esqueleto -->
      <div v-if="status === 'loading'" class="notif__skels" role="status" aria-busy="true">
        <span class="notif__sr">Cargando tus notificaciones</span>
        <div v-for="n in 6" :key="n" class="notif__row notif__row--skel" aria-hidden="true">
          <q-skeleton :animation="skeletonAnimation" type="circle" size="40px" />
          <div class="notif__skel-text">
            <q-skeleton :animation="skeletonAnimation" type="text" width="200px" height="15px" />
            <q-skeleton :animation="skeletonAnimation" type="text" width="140px" height="13px" />
          </div>
        </div>
      </div>

      <!-- Error de la primera página -->
      <div v-else-if="status === 'error'" class="notif__error" role="alert">
        <q-icon name="cloud_off" size="32px" class="notif__error-icon" aria-hidden="true" />
        <p class="notif__error-text">No pudimos cargar tus notificaciones.</p>
        <q-btn unelevated no-caps class="notif__btn" label="Reintentar" @click="loadFirstPage" />
      </div>

      <!-- Vacío -->
      <div v-else-if="items.length === 0" class="notif__empty">
        <q-icon
          name="notifications_none"
          size="40px"
          class="notif__empty-icon"
          aria-hidden="true"
        />
        <h2 class="notif__empty-title">Todavía no tenés avisos</h2>
        <p class="notif__empty-text">Acá van a quedar los que te mande la app.</p>
      </div>

      <!-- Lista por día -->
      <template v-else>
        <section
          v-for="(section, index) in sections"
          :key="`${section.key}-${index}`"
          class="notif__day"
          :aria-labelledby="section.label ? `notif-day-${index}` : undefined"
        >
          <h2 v-if="section.label" :id="`notif-day-${index}`" class="notif__day-title">
            {{ section.label }}
          </h2>
          <ul class="notif__list">
            <li v-for="item in section.items" :key="item.id" class="notif__item">
              <button
                :ref="(el) => setRowRef(item.id, el)"
                type="button"
                class="notif__row"
                :class="{ 'notif__row--unread': isNew(item) }"
                :aria-label="rowAria(item)"
                @click="onTap(item)"
              >
                <!-- Ícono: cara de quien regaló, chispa del profe (o de quien no se nombra, o de la Aura
                     celebrada) o ícono por tipo. Con `anonymous` no se dibuja a nadie: ni nombre, ni
                     inicial, ni foto. -->
                <MemberAvatar
                  v-if="item.gift && item.gift.giverKind === 'alumno' && !item.gift.anonymous"
                  :size="40"
                  :url="item.gift.giverPhotoUrl"
                  :first-name="item.gift.giverFirstName"
                  :last-initial="item.gift.giverLastInitial"
                />
                <span
                  v-else-if="item.gift || iconForKind(item.kind) === null"
                  class="notif__circle notif__circle--gift"
                  aria-hidden="true"
                  >✦</span
                >
                <span v-else class="notif__circle" aria-hidden="true">
                  <q-icon :name="iconForKind(item.kind) ?? 'notifications'" size="20px" />
                </span>

                <span class="notif__text">
                  <span class="notif__row-title">{{ item.title }}</span>
                  <span class="notif__row-sub">{{ subline(item) }}</span>
                  <!-- Anulado con su motivo (#28, #37): va bajo el texto, donde puede ocupar dos
                       líneas en un celular angosto sin empujar el resto de la fila. -->
                  <span
                    v-if="pillFor(item)?.kind === 'voided'"
                    class="notif__pill notif__pill--voided"
                    >{{ pillFor(item)?.text }}</span
                  >
                </span>

                <span
                  v-if="pillFor(item)?.kind === 'amount'"
                  class="notif__pill notif__pill--amount"
                >
                  <span class="notif__pill-spark" aria-hidden="true">✦</span>
                  {{ pillFor(item)?.text }}
                </span>

                <span v-if="isNew(item)" class="notif__dot" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <q-btn
          v-if="nextBefore !== null"
          unelevated
          no-caps
          class="notif__btn notif__btn--more"
          label="Ver más"
          :loading="loadingMore"
          @click="loadMore"
        />
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import { resolveTapRoute } from 'src/boot/push-notifications'
import { useNotificationsInboxApi } from 'src/composables/useNotificationsInboxApi'
import { useNotificationsInboxStore } from 'src/stores/useNotificationsInboxStore'
import { useUserStore } from 'src/stores/useUserStore'
import type { InboxItem } from 'src/types/notifications-inbox'
import {
  giftPill,
  groupByDay,
  iconForKind,
  rowAriaLabel,
  tapData,
  timeLabel,
  unreadIds,
} from 'src/utils/notifications-view'
import type { GiftPill } from 'src/utils/notifications-view'
import { createLogger } from 'src/utils/logger'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import { DEFAULT_BRANCH_TZ } from 'src/utils/tz'

const log = createLogger('NotificationsPage')
const $q = useQuasar()
const router = useRouter()
const userStore = useUserStore()
const inboxApi = useNotificationsInboxApi()
const inboxStore = useNotificationsInboxStore()

const skeletonAnimation = prefersReducedMotion() ? 'none' : 'pulse'

const status = ref<'loading' | 'ready' | 'error'>('loading')
const items = ref<InboxItem[]>([])
const nextBefore = ref<string | null>(null)
const loadingMore = ref(false)
/** Avisos que llegaron sin leer al entrar: se ven resaltados esta vez aunque ya estén marcados (#35). */
const newIds = ref<Set<number>>(new Set())

/** Cada carga o reintento invalida las respuestas en vuelo de la anterior. */
let requestSeq = 0
const rowEls = new Map<number, HTMLElement>()

const tz = computed(() => userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)
const sections = computed(() => groupByDay(items.value, tz.value, new Date()))

function isNew(item: InboxItem): boolean {
  return newIds.value.has(item.id)
}

function subline(item: InboxItem): string {
  const time = timeLabel(item.createdAt, tz.value)
  const body = item.body.trim()
  return [time, body].filter((part) => part !== '').join(' · ')
}

function rowAria(item: InboxItem): string {
  return rowAriaLabel(item, timeLabel(item.createdAt, tz.value), isNew(item))
}

function pillFor(item: InboxItem): GiftPill | null {
  return giftPill(item)
}

function setRowRef(id: number, el: unknown): void {
  if (el instanceof HTMLElement) rowEls.set(id, el)
  else rowEls.delete(id)
}

function goBack(): void {
  // vue-router deja en `history.state.back` la ruta anterior: sin ella no hay a dónde volver.
  const state: unknown = window.history.state
  const hasHistory =
    typeof state === 'object' &&
    state !== null &&
    'back' in state &&
    typeof (state as { back: unknown }).back === 'string'
  if (hasHistory) router.back()
  else void router.push('/mi-templo')
}

async function loadFirstPage(): Promise<void> {
  const mine = ++requestSeq
  status.value = 'loading'
  items.value = []
  newIds.value = new Set()
  nextBefore.value = null
  loadingMore.value = false
  try {
    const page = await inboxApi.list()
    if (mine !== requestSeq) return
    items.value = page.items
    nextBefore.value = page.nextBefore
    // El resaltado se fija con lo que llegó sin leer, ANTES de marcarlo todo como leído.
    newIds.value = unreadIds(page.items)
    status.value = 'ready'
    void markAllOnEntry(mine)
  } catch (err: unknown) {
    if (mine !== requestSeq) return
    log.error('No se pudieron cargar las notificaciones', {
      error: err instanceof Error ? err.message : String(err),
    })
    status.value = 'error'
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || nextBefore.value === null) return
  const mine = requestSeq
  loadingMore.value = true
  try {
    const page = await inboxApi.list(nextBefore.value)
    if (mine !== requestSeq) return
    const firstNewId = page.items[0]?.id
    items.value = [...items.value, ...page.items]
    nextBefore.value = page.nextBefore
    if (firstNewId !== undefined) {
      await nextTick()
      rowEls.get(firstNewId)?.focus()
    }
  } catch (err: unknown) {
    if (mine !== requestSeq) return
    log.error('No se pudieron cargar más notificaciones', {
      error: err instanceof Error ? err.message : String(err),
    })
    // Las filas ya cargadas quedan y el botón vuelve.
    $q.notify({ type: 'negative', message: 'No pudimos cargar más notificaciones.', timeout: 4000 })
  } finally {
    if (mine === requestSeq) loadingMore.value = false
  }
}

/** Tocar un aviso: lo marca leído al momento (sin esperar al servidor) y navega como una push. */
function onTap(item: InboxItem): void {
  if (item.readAt === null) {
    item.readAt = new Date().toISOString()
    inboxStore.markOneReadLocal()
    // Si falla queda leído en pantalla y el número se corrige con la consulta siguiente.
    void inboxApi
      .markRead(item.id)
      .catch((err: unknown) => {
        log.warn('No se pudo marcar el aviso como leído', {
          id: item.id,
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        void inboxStore.refreshCount()
      })
  }
  void router.push(resolveTapRoute(tapData(item)))
}

/**
 * Al entrar se marca todo como leído (#35): la campana vuelve a 0 y las filas que eran nuevas
 * siguen resaltadas esta vez. Si falla, queda como estaba (el contador real se vuelve a pedir) y
 * se reintenta la próxima vez que se entre; no se avisa porque la lista ya se ve.
 */
async function markAllOnEntry(mine: number): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    await inboxApi.markAllRead()
    // El número de la campana se corrige aunque ya se haya salido de la pantalla.
    inboxStore.markAllReadLocal()
    if (mine === requestSeq) {
      for (const item of items.value) {
        if (item.readAt === null) item.readAt = nowIso
      }
    }
  } catch (err: unknown) {
    log.warn('No se pudieron marcar las notificaciones como leídas al entrar', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    void inboxStore.refreshCount()
  }
}

onMounted(() => {
  void loadFirstPage()
})

onBeforeUnmount(() => {
  requestSeq++
  inboxApi.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';
@import 'src/css/brand';

.notif-page {
  background: $pd-light-surface;
  font-family: 'Geologica', sans-serif;
  color: $pd-ink;
}

.notif {
  max-width: 630px;
  margin: 0 auto;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: $pd-light-surface;

  // Misma grilla que las filas: 16 de margen, círculo de 40 y 16 de aire hasta el texto.
  &__header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 16px 6px;
  }

  // Círculo arena de 40, igual al de los íconos de la lista. El área tocable llega a 44.
  &__back {
    flex: none;
    position: relative;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #f3ede4;
    color: $pd-terra-ink;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &::after {
      content: '';
      position: absolute;
      inset: -2px;
    }

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: no-preference) {
      transition: transform 120ms ease;

      &:active {
        transform: scale(0.94);
      }
    }
  }

  &__title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 22px;
    line-height: 1.2;
    color: $pd-ink;
  }

  &__day {
    margin: 0;
  }

  &__day-title {
    @include pd-label-11;
    margin: 0;
    padding: 16px 16px 8px;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    margin: 0;
    padding: 0;
    border-top: 1px solid #f1eadf;

    // La primera fila de cada día no lleva borde.
    &:first-child {
      border-top: 0;
    }
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 64px;
    padding: 8px 16px;
    border: 0;
    background: transparent;
    font-family: 'Geologica', sans-serif;
    text-align: left;
    cursor: pointer;

    &--unread {
      background: #fffaf0;
    }

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: -2px;
    }

    &--skel {
      cursor: default;
    }
  }

  &__circle {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #f3ede4;
    color: $pd-terra-ink;

    // Regalo de un profe: círculo dorado con aro y la chispa decorativa.
    &--gift {
      background: $pd-gold-tint;
      box-shadow: inset 0 0 0 2px $pd-gold;
      font-size: 18px;
      line-height: 1;
      color: $pd-aura-spark;
    }
  }

  &__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  &__row-title,
  &__row-sub {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }

  &__row-title {
    font-size: 15px;
    font-weight: 400;
    line-height: 1.35;
    color: $pd-ink;
  }

  &__row-sub {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.3;
    color: $pd-ink-2;
  }

  &__pill {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 13px;
    line-height: 1.2;
    white-space: nowrap;

    &--amount {
      gap: 4px;
      background: $pd-gold-tint;
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: $pd-gold-ink;
    }

    &--voided {
      // Vive dentro de la columna de texto: puede partirse en dos líneas en un celular angosto.
      align-self: flex-start;
      padding: 2px 8px;
      background: #f3ede4;
      font-weight: 400;
      white-space: normal;
      color: $pd-ink-2;
    }
  }

  &__pill-spark {
    color: $pd-gold;
  }

  &__dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $pd-terra-ink;
  }

  &__skel-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    text-align: center;
  }

  &__empty-icon {
    color: $pd-light-edge;
  }

  &__empty-title {
    margin: 8px 0 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__empty-text {
    margin: 8px 0 0;
    font-size: 15px;
    line-height: 1.5;
    color: $pd-ink-2;
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    text-align: center;
  }

  &__error-icon {
    color: $pd-light-edge;
  }

  &__error-text {
    margin: 12px 0 16px;
    font-size: 15px;
    line-height: 1.5;
    color: $pd-ink;
  }

  &__btn {
    @include pd-cta(48px);
    @include pd-cta-secondary-light;
    min-width: 200px;

    &--more {
      display: flex;
      width: calc(100% - 32px);
      margin: 16px 16px 24px;
    }
  }

  // Texto solo para lectores de pantalla.
  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

.notif__error .notif__btn {
  max-width: 280px;
}
</style>
