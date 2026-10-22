<template>
  <CqSky v-if="member" class="cq-home">
    <CqSun
      title="CONQUER"
      :caps="`Semana ${member.blockWeek}`"
      :big="levelInfo ? levelInfo.name : 'Conquer'"
      small="Tu nivel"
    >
      <CqLevelIcon v-if="member.level" :level="member.level" :size="44" />
    </CqSun>

    <router-link
      :to="{ name: 'conquer-niveles' }"
      class="cq-home__path"
      aria-label="Ver el camino de niveles"
    >
      <template v-for="(lv, i) in LEVELS" :key="lv">
        <span v-if="i > 0" class="cq-home__ln" aria-hidden="true" />
        <span
          class="cq-home__lv"
          :class="{
            'cq-home__lv--on': i === levelIndex,
            'cq-home__lv--past': levelIndex > i,
          }"
        >
          <CqLevelIcon :level="lv" :size="i === levelIndex ? 46 : 38" />
          {{ LEVEL_INFO[lv].name }}
        </span>
      </template>
      <span class="cq-home__more">El camino de Milón ›</span>
    </router-link>

    <div class="cq-caps cq-rule">Tu semana</div>
    <ul class="cq-home__week">
      <li v-for="d in member.home.plan" :key="d.dayKey">
        <router-link
          :to="dayTarget(d.dayKey)"
          class="cq-home__day"
          :class="{
            'cq-home__day--done': d.done,
            'cq-home__day--next': !d.done && d.dayKey === member.home.nextDayKey,
          }"
        >
          <span>{{ dayStatus(d) }}</span>
          <strong>{{ d.label }}</strong>
        </router-link>
      </li>
    </ul>
    <div v-if="member.home.weekComplete" class="cq-toast cq-home__complete" role="status">
      Semana completa
    </div>

    <div class="cq-caps cq-rule">Última marca</div>
    <div v-if="marks.length > 0" class="cq-card cq-home__marks">
      <div v-for="m in marks" :key="m.key" class="cq-home__mark">
        <div class="cq-home__mark-text">
          <div class="cq-home__mark-name">{{ m.name }}</div>
          <div class="cq-sub">{{ m.sub }}</div>
        </div>
        <b class="cq-num cq-home__mark-value">{{ m.value }}</b>
      </div>
    </div>
    <div v-else class="cq-sub cq-home__empty">Todavía no cargaste marcas.</div>

    <div v-if="bodyCheckNotice" class="cq-toast cq-home__notice" role="status">
      <i aria-hidden="true" />
      <span>{{ bodyCheckNotice }}</span>
    </div>

    <!-- 201-19/20: accesos (Progreso, Evolución y el botón del aviso de control) -->

    <div class="cq-grow" />

    <CqCloudButton :label="ctaLabel" @click="goToday" />
  </CqSky>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { useConquerStore } from '../stores/conquerStore'
import { LEVEL_INFO, shortDate, unitText } from '../utils/format'
import type { Level, PlanDayView } from '../types'
import CqSky from './brand/CqSky.vue'
import CqSun from './brand/CqSun.vue'
import CqLevelIcon from './brand/CqLevelIcon.vue'
import CqCloudButton from './brand/CqCloudButton.vue'

// Fase 201 §7.1 Inicio, D-22: sol con el nivel y la semana del bloque, camino de niveles, la semana
// del plan (D-16), la última marca de cada día y el aviso de control físico. El app no recalcula
// nada: pinta lo que manda `GET /state` (`member.home`, `member.bodyCheck`).
const LEVELS: readonly Level[] = ['ternero', 'novillo', 'toro']

const router = useRouter()
const store = useConquerStore()

const member = computed(() => store.state?.member ?? null)
const levelInfo = computed(() => (member.value?.level ? LEVEL_INFO[member.value.level] : null))
const levelIndex = computed(() => (member.value?.level ? LEVELS.indexOf(member.value.level) : -1))

// D-16: el sábado de Toro (combos) tiene su propia pantalla (201-19); mientras no exista la ruta,
// Hoy lo resuelve solo y muestra el primer día del plan.
function dayTarget(dayKey: string): RouteLocationRaw {
  if (dayKey === 'sabado' && router.hasRoute('conquer-sabado')) return { name: 'conquer-sabado' }
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
  if (next === 'sabado' && router.hasRoute('conquer-sabado')) {
    void router.push({ name: 'conquer-sabado' })
    return
  }
  void router.push({ name: 'conquer-hoy' })
}

function dayStatus(d: PlanDayView): string {
  if (d.done) return 'Hecha'
  return d.dayKey === member.value?.home.nextDayKey ? 'Te toca' : 'Pendiente'
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
// Camino de niveles: tres cabezas unidas por filetes (prototipo `.path`)
.cq-home__path {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr) 26px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  min-height: 44px;
  padding: 14px 12px 12px;
  border-radius: 16px;
  border: 1px solid var(--cq-hair2);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.035));
  color: var(--cq-muted);
  text-align: center;
  text-decoration: none;
}

.cq-home__lv {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.6;

  &--on {
    opacity: 1;
    color: var(--cq-gold-hi);
  }

  &--past {
    opacity: 0.85;
    color: var(--cq-gold);
  }
}

.cq-home__ln {
  height: 1px;
  background: var(--cq-hair);
}

.cq-home__more {
  grid-column: 1 / -1;
  margin-top: 6px;
  font-family: var(--cq-display);
  font-style: italic;
  font-size: 16px;
  color: var(--cq-muted);
}

// Semana del plan: una celda por día; con 5 días (Toro) la última baja de renglón
.cq-home__week {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cq-home__day {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  height: 100%;
  min-height: 44px;
  text-decoration: none;
  padding: 12px 4px;
  border: 1px solid var(--cq-hair2);
  border-radius: 14px;
  text-align: center;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cq-muted);

  strong {
    overflow-wrap: anywhere;
    font-family: var(--cq-display);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: var(--cq-cream);
  }

  &--done {
    background: var(--cq-glass);
    color: var(--cq-gold);
  }

  &--next {
    background: var(--cq-sun);
    border-color: var(--cq-sun);
    color: var(--cq-ink2);
    box-shadow: 0 0 26px rgba(253, 241, 208, 0.28);

    strong {
      color: var(--cq-ink);
    }
  }
}

.cq-home__complete {
  text-align: center;
}

.cq-home__marks {
  gap: 0;
  padding-block: 5px;
}

.cq-home__mark {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid var(--cq-hair2);

  &:first-child {
    border-top: 0;
  }
}

.cq-home__mark-text {
  min-width: 0;
}

.cq-home__mark-name {
  font-weight: 500;
}

.cq-home__mark-value {
  flex-shrink: 0;
  font-family: var(--cq-display);
  font-size: 24px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--cq-gold-hi);
}

.cq-home__empty {
  text-align: center;
}

// Aviso fijo del control físico (sol + texto). En este plan es solo texto: 201-20 le suma el botón.
.cq-home__notice {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;

  i {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--cq-sun);
    box-shadow: 0 0 12px var(--cq-sun);
  }
}
</style>
