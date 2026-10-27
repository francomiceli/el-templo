<template>
  <CqScreen v-if="member" class="cq-home">
    <CqPortico>
      <p class="cq-kicker">Conquer · Semana {{ member.blockWeek }} del bloque</p>

      <div class="cq-home__lvl">
        <CqLevelIcon v-if="member.level" :level="member.level" :size="56" />
        <div class="cq-home__lvl-text">
          <h2 class="cq-home__lvl-name">{{ levelInfo ? levelInfo.name : 'Conquer' }}</h2>
          <p class="cq-sub">{{ levelInfo ? `Tu nivel · ${levelInfo.text}` : 'Tu nivel' }}</p>
        </div>
      </div>

      <router-link
        :to="{ name: 'conquer-niveles' }"
        class="cq-home__path"
        aria-label="Ver el camino de niveles"
      >
        <template v-for="(lv, i) in LEVELS" :key="lv">
          <span v-if="i > 0" class="cq-home__ln" aria-hidden="true" />
          <span class="cq-home__lv" :class="{ 'cq-home__lv--on': i === levelIndex }">
            <CqLevelIcon :level="lv" :size="i === levelIndex ? 38 : 30" />
            {{ LEVEL_INFO[lv].name }}
          </span>
        </template>
        <span class="cq-textlink cq-home__more">El camino de Milón ›</span>
      </router-link>

      <CqButton :label="ctaLabel" variant="on-night" @click="goToday" />
    </CqPortico>

    <div v-if="bodyCheckNotice" class="cq-notice" role="status">
      <span class="cq-home__notice-text">{{ bodyCheckNotice }}</span>
      <router-link :to="{ name: 'conquer-control' }" class="cq-btn cq-btn--secondary cq-btn--small">
        Hacerlo ahora
      </router-link>
    </div>

    <div class="cq-row">
      <h2 class="cq-block-title">Tu semana</h2>
      <span v-if="member.home.weekComplete" class="cq-chip cq-chip--hecha" role="status">
        Semana completa
      </span>
    </div>
    <div class="cq-card cq-card--flush">
      <router-link
        v-for="d in member.home.plan"
        :key="d.dayKey"
        :to="dayTarget(d.dayKey)"
        class="cq-home__wrow"
        :class="{ 'cq-home__wrow--next': isNext(d) }"
      >
        <span class="cq-home__wday">{{ d.label }}</span>
        <span v-if="d.done" class="cq-chip cq-chip--hecha">
          <span aria-hidden="true">✓</span>
          {{ dayStatus(d) }}
        </span>
        <span v-else-if="isNext(d)" class="cq-chip cq-chip--techo">{{ dayStatus(d) }}</span>
        <span v-else class="cq-sub">{{ dayStatus(d) }}</span>
      </router-link>
    </div>

    <h2 class="cq-block-title">Última marca</h2>
    <div v-if="marks.length > 0" class="cq-card cq-card--flush">
      <div v-for="m in marks" :key="m.key" class="cq-home__mark">
        <div class="cq-home__mark-text">
          <div class="cq-home__mark-name">{{ m.name }}</div>
          <div class="cq-sub">{{ m.sub }}</div>
        </div>
        <b class="cq-num cq-home__mark-value">{{ m.value }}</b>
      </div>
    </div>
    <p v-else class="cq-sub">Todavía no cargaste marcas.</p>

    <div class="cq-card cq-card--flush">
      <router-link :to="{ name: 'conquer-guia' }" class="cq-rowlink">
        <span class="cq-q" aria-hidden="true">?</span>
        ¿Cómo funciona?
        <span class="cq-rowlink__chev" aria-hidden="true">›</span>
      </router-link>
      <router-link :to="{ name: 'conquer-progreso' }" class="cq-rowlink">
        Progreso
        <span class="cq-rowlink__chev" aria-hidden="true">›</span>
      </router-link>
      <router-link :to="{ name: 'conquer-evolucion' }" class="cq-rowlink">
        Evolución
        <span class="cq-rowlink__chev" aria-hidden="true">›</span>
      </router-link>
      <!-- Fase 202 D-29, DA-46: las respuestas del coach sin ver se cuentan acá y bajan al abrir la pantalla -->
      <router-link
        :to="{ name: 'conquer-correcciones' }"
        class="cq-rowlink"
        :aria-label="correctionsLabel"
        data-test="conquer-home-corrections"
      >
        Correcciones
        <span v-if="unseenReplies > 0" class="cq-chip cq-chip--nueva cq-home__nuevas">
          {{ unseenReplies }} {{ unseenReplies === 1 ? 'nueva' : 'nuevas' }}
        </span>
        <span class="cq-rowlink__chev" aria-hidden="true">›</span>
      </router-link>
    </div>
  </CqScreen>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { LEVEL_INFO, shortDate, unitText } from '../utils/format'
import type { Level, PlanDayView } from '../types'
import CqScreen from './brand/CqScreen.vue'
import CqPortico from './brand/CqPortico.vue'
import CqButton from './brand/CqButton.vue'
import CqLevelIcon from './brand/CqLevelIcon.vue'

// Fase 201 §7.1 Inicio, DA-29: el pórtico del nivel (semana del bloque, camino de niveles y el botón
// de entrenar, todo en la única pieza oscura), el aviso de control físico, la semana del plan (D-16),
// la última marca de cada día y los accesos fijos (¿Cómo funciona?, Progreso, Evolución y, desde la
// 202, Correcciones con el contador de respuestas nuevas). El app no recalcula nada: pinta lo que
// manda `GET /state` (`member.home`, `member.bodyCheck`, `member.corrections`).
const LEVELS: readonly Level[] = ['ternero', 'novillo', 'toro']

const router = useRouter()
const store = useConquerStore()

const member = computed(() => store.state?.member ?? null)
const levelInfo = computed(() => (member.value?.level ? LEVEL_INFO[member.value.level] : null))
const levelIndex = computed(() => (member.value?.level ? LEVELS.indexOf(member.value.level) : -1))

// D-16, S12-3: el sábado de Toro (combos) tiene su propia pantalla; los demás días abren Hoy.
function dayTarget(dayKey: string): RouteLocationRaw {
  if (dayKey === 'sabado') return { name: 'conquer-sabado' }
  return { name: 'conquer-hoy', query: { day: dayKey } }
}

const nextDay = computed(() => {
  const home = member.value?.home
  return home?.plan.find((d) => d.dayKey === home.nextDayKey) ?? null
})

// Con la semana completa se puede repetir cualquier día (D-16)
const ctaLabel = computed(() => {
  if (member.value?.home.weekComplete || !nextDay.value) return 'Repetir un día'
  return `Entrenar hoy: ${nextDay.value.label}`
})

function goToday(): void {
  const next = member.value?.home.nextDayKey
  void router.push(next === 'sabado' ? { name: 'conquer-sabado' } : { name: 'conquer-hoy' })
}

// El día que toca: el primero sin hacer según el API (lleva chip "Te toca" y la barrita dorada)
function isNext(d: PlanDayView): boolean {
  return !d.done && d.dayKey === member.value?.home.nextDayKey
}

function dayStatus(d: PlanDayView): string {
  if (d.done) return 'Hecha'
  return isNext(d) ? 'Te toca' : 'Pendiente'
}

interface MarkRow {
  key: string
  name: string
  sub: string
  value: string
}

const marks = computed<MarkRow[]>(() => {
  const rows: MarkRow[] = []
  for (const day of member.value?.home.lastByDay ?? []) {
    for (const e1 of day.e1) {
      rows.push({
        key: `${day.dayKey}:${e1.exerciseName}`,
        name: e1.exerciseName,
        sub: day.date ? `${day.label} · ${shortDate(day.date)}` : day.label,
        value: unitText(e1.value, e1.unit, e1.unilateral),
      })
    }
  }
  return rows
})

// Fase 202 DA-46: respuestas del coach sin ver (`GET /state` las manda solo con alumno activo)
const unseenReplies = computed(() => member.value?.corrections?.unseenReplies ?? 0)

const correctionsLabel = computed<string | undefined>(() => {
  const n = unseenReplies.value
  if (n <= 0) return undefined
  return `Correcciones, ${n} ${n === 1 ? 'respuesta nueva' : 'respuestas nuevas'}`
})

// D-15: aviso fijo si saltó el día 0; §6: aviso si toca el control periódico
const bodyCheckNotice = computed<string | null>(() => {
  const check = member.value?.bodyCheck
  if (!check) return null
  if (check.day0Pending) return 'Tu control del día 0 está pendiente'
  if (check.due) return 'Toca tu control físico'
  return null
})
</script>

<style scoped lang="scss">
// Pórtico: nivel (ícono + nombre) y su frase
.cq-home__lvl {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.cq-home__lvl-text {
  min-width: 0;
}

.cq-home__lvl-name {
  margin: 0 0 4px;
  font-family: var(--cq-font-head);
  font-weight: 800;
  font-size: 36px;
  line-height: 0.95;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--cq-on-night-hi);
}

// Camino de niveles: tres cabezas unidas por filetes dorados, todo el bloque es UN enlace
.cq-home__path {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr) 22px minmax(0, 1fr);
  align-items: center;
  gap: 2px;
  min-height: 44px;
  color: inherit;
  text-align: center;
  text-decoration: none;
}

.cq-home__lv {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-family: var(--cq-font-head);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cq-on-night-2);

  &--on {
    font-weight: 800;
    color: var(--cq-on-night-hi);
  }
}

// Las cabezas que no son la del alumno van en dorado apagado (el de la pieza oscura). Con el
// selector del camino delante le ganan a la regla de `.cq-dark` sobre el ícono.
.cq-home__path .cq-home__lv .cq-level-icon {
  color: var(--cq-on-night-gold);
}

.cq-home__path .cq-home__lv--on .cq-level-icon {
  color: var(--cq-on-night-hi);
}

.cq-home__ln {
  height: 1.5px;
  background: var(--cq-deco-gold);
}

.cq-home__more {
  grid-column: 1 / -1;
  justify-self: center;
}

// Aviso del control físico: el texto cede lugar y el botón baja si no entran en una fila
.cq-home__notice-text {
  flex: 1 1 150px;
  min-width: 0;
}

.cq-notice .cq-btn {
  text-decoration: none;
}

// Correcciones: el chip de respuestas nuevas queda pegado al chevron (el margen automático del
// chevron se corre al chip para no repartir el espacio libre entre los dos)
.cq-home__nuevas {
  margin-left: auto;
}

.cq-home__nuevas + .cq-rowlink__chev {
  margin-left: 0;
}

// Semana del plan: una fila de 52 px por día; la que toca lleva la barrita dorada a la izquierda
.cq-home__wrow {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  color: var(--cq-text);
  text-decoration: none;

  & + & {
    border-top: 1px solid var(--cq-line);
  }

  &--next::before {
    content: '';
    position: absolute;
    left: -16px;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--cq-deco-gold);
  }
}

.cq-home__wday {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 500;
  font-size: 15px;
}

// Última marca: nombre y fecha a la izquierda, valor grande a la derecha
.cq-home__mark {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 56px;

  & + & {
    border-top: 1px solid var(--cq-line);
  }
}

.cq-home__mark-text {
  min-width: 0;
}

.cq-home__mark-name {
  overflow-wrap: anywhere;
  font-weight: 500;
  font-size: 15px;
}

.cq-home__mark-value {
  flex-shrink: 0;
  font-size: 24px;
  white-space: nowrap;
}
</style>
