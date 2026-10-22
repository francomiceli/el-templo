<template>
  <div class="cq-art" aria-hidden="true">
    <template v-if="screen === 'serie'">
      <div class="cq-art__stairs">
        <div
          v-for="stair in STAIRS"
          :key="stair.key"
          class="cq-art__st"
          :class="[`cq-art__st--${stair.key}`, { 'cq-art__st--hold': stair.key === 'hold' }]"
        >
          <b class="cq-art__greek">{{ GREEK_STEP[stair.key] }}</b>
          <span class="cq-art__st-name">{{ stair.name }}</span>
          <small class="cq-art__st-hint">{{ stair.hint }}</small>
        </div>
      </div>
      <div class="cq-art__flow">sin descanso</div>
    </template>

    <template v-else-if="screen === 'numero'">
      <div class="cq-art__series">
        <CqGreek step="e1" class="cq-art__series-greek" />
        <div
          v-for="serie in SERIES"
          :key="serie.n"
          class="cq-art__ficha"
          :class="{ 'cq-art__ficha--min': serie.reps === WORST }"
        >
          <span>Serie {{ serie.n }}</span>
          <b class="cq-num cq-art__ficha-num">{{ serie.reps }}</b>
        </div>
      </div>
      <div class="cq-art__res">
        <div class="cq-art__res-lb">
          <b>Escalón 1</b>
          <span>anotás la peor</span>
        </div>
        <div class="cq-art__res-val">
          <b class="cq-num cq-art__res-num">{{ WORST }}</b>
          <span>reps</span>
        </div>
      </div>
    </template>

    <template v-else-if="screen === 'apretar'">
      <div class="cq-art__lvbar">
        <div v-for="line in levelLines" :key="line.level" class="cq-art__lv">
          <CqLevelIcon :level="line.level" :size="40" />
          <div class="cq-art__lv-text">
            <b>{{ line.title }}</b>
            <span>{{ line.text }}</span>
          </div>
        </div>
      </div>
      <div v-for="fail in FAILURES" :key="fail.title" class="cq-art__fr">
        <b>{{ fail.title }}</b>
        <span>{{ fail.examples }} {{ fail.rule }}</span>
      </div>
    </template>

    <template v-else-if="screen === 'apertura'">
      <div class="cq-art__chain">
        <template v-for="(link, i) in CHAIN" :key="link.name">
          <span v-if="i > 0" class="cq-art__ar">→</span>
          <div class="cq-art__ck">
            <b>{{ link.name }}</b>
            <span>{{ link.hint }}</span>
          </div>
        </template>
      </div>
      <div class="cq-art__sat"><b>Sábado:</b> {{ CQ_TEXTOS.sabado_combo }}</div>
    </template>

    <template v-else-if="screen === 'subir'">
      <div class="cq-art__tl">
        <div class="cq-art__tli">
          <span class="cq-art__dot">1</span>
          <div class="cq-art__tx">
            Primera vez en el techo
            <span :class="['cq-chip', `cq-chip--${techoChip.tone}`]">{{ techoChip.label }}</span>
          </div>
        </div>
        <div class="cq-art__tli">
          <span class="cq-art__dot">2</span>
          <div class="cq-art__tx">
            Segunda vez seguida
            <span :class="['cq-chip', `cq-chip--${subirChip.tone}`]">{{ subirChip.label }}</span>
          </div>
        </div>
        <div class="cq-art__tli">
          <span class="cq-art__dot">3</span>
          <div class="cq-art__tx">
            Tocás Subir en Progreso
            <span class="cq-btn cq-btn--subir cq-btn--small cq-art__subir">Subir</span>
            <span class="cq-art__note">
              Pasás a la progresión más difícil y ese escalón arranca de nuevo en
              {{ GUIDE_FLOOR.reps }} reps o {{ GUIDE_FLOOR.s }} s.
            </span>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="screen === 'molestia'">
      <div class="cq-art__scale">
        <i v-for="n in SCALE" :key="n" :class="{ 'cq-art__scale--hi': n >= GUIDE_PAIN_MIN }">
          {{ n }}
        </i>
      </div>
      <div class="cq-art__scale-l">
        <span>0 a {{ GUIDE_PAIN_MIN - 1 }}: seguís igual</span>
        <b>{{ GUIDE_PAIN_MIN }} o más: tu coach lo ve</b>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CqGreek from '../brand/CqGreek.vue'
import CqLevelIcon from '../brand/CqLevelIcon.vue'
import { CQ_TEXTOS, GREEK_STEP, LEVEL_INFO, estadoChip } from '../../utils/format'
import {
  GUIDE_FAILURE_EXAMPLES,
  GUIDE_FLOOR,
  GUIDE_PAIN_MIN,
  guideLevelLine,
} from '../../utils/guide'
import type { GuideKey } from '../../utils/guide'
import type { Level, StepKey } from '../../types'

// Fase 201 DA-28 (sketch 022 `.ill`): la ilustración de cada pantalla de la guía. Vive sobre la card
// blanca que pone la página, así que usa los tokens de texto sobre claro; solo el Ω y el recuadro del
// sábado son azul noche. Todo es `aria-hidden`: el contenedor de la página ya es `role="img"` con el
// `artLabel` de la pantalla. Nada acá es un control (el "Subir" es un `span`, no un botón). Los
// textos del método salen de `CQ_TEXTOS`/`utils/guide.ts`; acá solo van los rótulos del dibujo.
const props = defineProps<{
  screen: GuideKey
  level: Level | null
}>()

const STAIRS: readonly { key: StepKey; name: string; hint: string }[] = [
  { key: 'e1', name: 'Escalón 1', hint: 'el más difícil' },
  { key: 'e2', name: 'Escalón 2', hint: 'un poco más fácil' },
  { key: 'e3', name: 'Escalón 3', hint: 'más fácil' },
  { key: 'hold', name: 'Hold final', hint: 'quieto, al fallo' },
]

// Ejemplo de las tres series del escalón 1: se anota la peor (la de menos reps).
const SERIES = [
  { n: 1, reps: 7 },
  { n: 2, reps: 6 },
  { n: 3, reps: 5 },
] as const
const WORST = Math.min(...SERIES.map((serie) => serie.reps))

const FAILURES = [
  {
    title: 'Brazos rectos',
    examples: GUIDE_FAILURE_EXAMPLES.rectos,
    rule: CQ_TEXTOS.fallo_rectos,
  },
  {
    title: 'Brazos flexionados',
    examples: GUIDE_FAILURE_EXAMPLES.flexionados,
    rule: CQ_TEXTOS.fallo_flexionados,
  },
] as const

const CHAIN = [
  { name: 'Press', hint: 'sube y baja' },
  { name: 'Push', hint: 'empuje o tirón' },
  { name: 'Hold', hint: 'quieto' },
] as const

const SCALE = Array.from({ length: 11 }, (_, n) => n)

const techoChip = estadoChip('techo1')
const subirChip = estadoChip('subir')

interface LevelLine {
  level: Level
  title: string
  text: string
}

// Con nivel: solo su línea ("Sos Toro"). Sin nivel (no debería pasar con un alumno activo): las tres.
const levelLines = computed<LevelLine[]>(() => {
  const own = guideLevelLine(props.level)
  if (props.level !== null && own) return [{ level: props.level, ...own }]
  return (Object.keys(LEVEL_INFO) as Level[]).map((level) => ({
    level,
    title: LEVEL_INFO[level].name,
    text: LEVEL_INFO[level].text,
  }))
})
</script>

<style scoped lang="scss">
.cq-art {
  min-width: 0;
  color: var(--cq-text);
}

// ── 1 · escalones ──────────────────────────────────────
.cq-art__stairs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  align-items: end;
}

.cq-art__st {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 10px 4px 8px;
  border-radius: 10px 10px 4px 4px;
  background: var(--cq-tint-cream);
  box-shadow: inset 0 0 0 1px var(--cq-edge-gold);
  text-align: center;
  overflow-wrap: anywhere;
}

.cq-art__st--e1 {
  height: 150px;
}

.cq-art__st--e2 {
  height: 128px;
}

.cq-art__st--e3 {
  height: 106px;
}

.cq-art__st--hold {
  height: 150px;
  background: var(--cq-night);
  box-shadow: none;
}

.cq-art__greek {
  font-family: var(--cq-font-greek);
  font-weight: 700;
  font-size: 24px;
  line-height: 1;
  color: var(--cq-night);
}

.cq-art__st-name {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--cq-text);
}

.cq-art__st-hint {
  font-size: 11.5px;
  line-height: 1.2;
  color: var(--cq-text-2);
}

.cq-art__st--hold .cq-art__greek {
  color: var(--cq-on-night-hi);
}

.cq-art__st--hold .cq-art__st-name {
  color: var(--cq-on-night);
}

.cq-art__st--hold .cq-art__st-hint {
  color: var(--cq-on-night-2);
}

.cq-art__flow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--cq-text-2);

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1.5px;
    background: var(--cq-deco-gold);
  }
}

// ── 2 · peor de 3 ──────────────────────────────────────
.cq-art__series {
  display: grid;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: center;
}

// El aro dorado de `CqGreek` sobresale 3 px: se deja aire a la derecha
.cq-art__series-greek {
  margin-right: 4px;
}

.cq-art__ficha {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  border-radius: 10px;
  background: var(--cq-sand);
  font-size: 12px;
  color: var(--cq-text-2);
}

.cq-art__ficha-num {
  font-size: 22px;
}

.cq-art__ficha--min {
  background: var(--cq-surface);
  box-shadow: inset 0 0 0 2px var(--cq-night);
  color: var(--cq-night);
  font-weight: 600;
}

.cq-art__res {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--cq-line);
}

.cq-art__res-lb {
  min-width: 0;

  b {
    display: block;
    font-size: 15px;
    font-weight: 600;
  }

  span {
    display: block;
    font-size: 13px;
    color: var(--cq-text-2);
  }
}

.cq-art__res-val {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  color: var(--cq-text-2);
}

.cq-art__res-num {
  font-size: 30px;
  line-height: 1;
}

// ── 3 · fallo ──────────────────────────────────────────
.cq-art__lvbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cq-line);
}

.cq-art__lv {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.cq-art__lv-text {
  min-width: 0;

  b {
    display: block;
    font-family: var(--cq-font-head);
    font-weight: 700;
    font-size: 16px;
    color: var(--cq-night);
  }

  span {
    font-size: 14px;
    color: var(--cq-text);
  }
}

.cq-art__fr {
  padding-top: 12px;

  b {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--cq-text);
  }

  span {
    display: block;
    margin-top: 2px;
    font-size: 14px;
    line-height: 1.4;
    color: var(--cq-text-2);
  }

  & + & {
    margin-top: 12px;
    border-top: 1px solid var(--cq-line);
  }
}

// ── 4 · combo ──────────────────────────────────────────
.cq-art__chain {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 4px;
  align-items: center;
}

.cq-art__ck {
  min-width: 0;
  padding: 10px 4px;
  border-radius: 12px;
  background: var(--cq-tint-cream);
  box-shadow: inset 0 0 0 1px var(--cq-edge-gold);
  text-align: center;
  overflow-wrap: anywhere;

  b {
    display: block;
    font-family: var(--cq-font-head);
    font-weight: 700;
    font-size: 14px;
    color: var(--cq-night);
  }

  span {
    display: block;
    font-size: 11.5px;
    color: var(--cq-text-2);
  }
}

.cq-art__ar {
  font-weight: 700;
  font-size: 16px;
  color: var(--cq-text-gold);
}

.cq-art__sat {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--cq-night);
  color: var(--cq-on-night);
  font-size: 14px;
  line-height: 1.45;

  b {
    font-weight: 600;
    color: var(--cq-on-night-hi);
  }
}

// ── 5 · subir ──────────────────────────────────────────
.cq-art__tl {
  display: flex;
  flex-direction: column;
}

.cq-art__tli {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;

  &::before {
    content: '';
    position: absolute;
    left: 13px;
    top: 36px;
    bottom: -8px;
    width: 1.5px;
    background: var(--cq-deco-gold);
  }

  &:last-child::before {
    display: none;
  }
}

.cq-art__dot {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cq-surface);
  box-shadow: inset 0 0 0 1.5px var(--cq-edge-gold);
  font-family: var(--cq-font-head);
  font-weight: 700;
  font-size: 13px;
  color: var(--cq-night);
}

.cq-art__tx {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  font-size: 14px;
  line-height: 1.4;
  color: var(--cq-text);
}

// `.cq-btn` es un botón de ancho completo con cursor de mano: acá es solo un dibujo
.cq-art__tx .cq-art__subir {
  cursor: default;
  pointer-events: none;
}

.cq-art__note {
  font-size: 13px;
  color: var(--cq-text-2);
}

// ── 6 · molestia ───────────────────────────────────────
.cq-art__scale {
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  gap: 3px;

  i {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--cq-sand);
    font-style: normal;
    font-weight: 600;
    font-size: 13px;
    color: var(--cq-text-2);
  }
}

.cq-art__scale .cq-art__scale--hi {
  background: var(--cq-surface);
  box-shadow: inset 0 0 0 1.5px var(--cq-edge-gold);
  color: var(--cq-text-gold);
}

.cq-art__scale-l {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--cq-text-2);

  b {
    font-weight: 600;
    color: var(--cq-text-gold);
  }
}
</style>
