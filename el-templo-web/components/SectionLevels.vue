<script setup lang="ts">
/**
 * SectionLevels -- "Progresi&oacute;n" section.
 *
 * Interactive 6-level tab system (Alfa through Olympic).
 * Lets visitors identify with a training level ("Where am I in this journey?")
 * -- the bridge between method understanding and conversion action.
 *
 * Features:
 * - 6 tabs with sliding underline indicator (desktop)
 * - Keyboard navigation (ArrowLeft / ArrowRight, wrapping)
 * - ARIA tablist / tab / tabpanel roles
 * - Fade-in panel animation on tab change
 * - Responsive: horizontal scroll + snap on mobile, stacked layout
 * - Scroll-reveal entrance animation
 */

interface Level {
  id: string;
  name: string;
  number: number;
  headline: string;
  description: string;
  mirror: string;
}

const levels: Level[] = [
  {
    id: "alfa",
    name: "Alfa",
    number: 1,
    headline: "Donde todo empieza.",
    description:
      "Tu cuerpo aprende a moverse de nuevo. Patrones b\u00E1sicos de fuerza, movilidad y control. No importa de d\u00F3nde ven\u00EDs \u2014 importa hacia d\u00F3nde vas. Alfa es el cimiento sobre el que se construye todo lo dem\u00E1s.",
    mirror:
      "\u201CReci\u00E9n empiezo pero quiero hacerlo bien desde el d\u00EDa uno.\u201D",
  },
  {
    id: "delta",
    name: "Delta",
    number: 2,
    headline: "El cambio se siente.",
    description:
      "Los movimientos empiezan a fluir. La fuerza aparece donde antes no estaba. Tu cuerpo ya no solo se adapta \u2014 responde. Delta es donde el m\u00E9todo empieza a demostrarte por qu\u00E9 funciona.",
    mirror:
      "\u201CYa entreno hace unos meses y siento que estoy avanzando de verdad.\u201D",
  },
  {
    id: "sigma",
    name: "Sigma",
    number: 3,
    headline: "La fuerza se vuelve lenguaje.",
    description:
      "Movimientos avanzados. Potencia real. Tu cuerpo hace cosas que antes parec\u00EDan imposibles. Sigma es donde la calistenia deja de ser ejercicio y se convierte en dominio. El m\u00E9todo no afloja \u2014 vos tampoco.",
    mirror:
      "\u201CYa no entreno para ponerme en forma. Entreno para ser m\u00E1s fuerte en serio.\u201D",
  },
  {
    id: "omega",
    name: "Omega",
    number: 4,
    headline: "Donde los l\u00EDmites se reescriben.",
    description:
      "Progresiones avanzadas, control absoluto, fuerza que se ve y se siente. Omega es para quienes llevan a\u00F1os en el camino y siguen buscando m\u00E1s. No es el final \u2014 es donde el entrenamiento se vuelve arte.",
    mirror:
      "\u201CLlevo a\u00F1os entrenando. Necesito un lugar que me desaf\u00EDe de verdad.\u201D",
  },
  {
    id: "spartan",
    name: "Spartan",
    number: 5,
    headline: "Tu ejemplo es tu ense\u00F1anza.",
    description:
      "Ya no entren\u00E1s solo para vos. Tu presencia eleva a la comunidad. Spartan es el nivel de quien lidera desde la pr\u00E1ctica, no desde la teor\u00EDa. Un referente dentro del Templo.",
    mirror:
      "\u201CQuiero devolver lo que este m\u00E9todo me dio. Quiero inspirar a otros.\u201D",
  },
  {
    id: "olympic",
    name: "Olympic",
    number: 6,
    headline: "Aret\u00E9. Excelencia en todo sentido.",
    description:
      "Excelencia f\u00EDsica, mental y espiritual. Olympic no es un destino \u2014 es un est\u00E1ndar. La b\u00FAsqueda permanente de ser mejor en el cuerpo, la mente y la vida. El nivel m\u00E1s alto del Templo es tambi\u00E9n el m\u00E1s humilde: quien m\u00E1s sabe es quien m\u00E1s practica.",
    mirror:
      "\u201CEl entrenamiento no es parte de mi vida. Es mi forma de vivir.\u201D",
  },
];

const activeLevel = ref("alfa");
const animating = ref(false);

// Template refs for tab buttons (keyboard focus management)
const tabRefs: Record<string, HTMLElement> = {};

const activeIndex = computed(() =>
  levels.findIndex((l) => l.id === activeLevel.value),
);

const activeData = computed((): Level => {
  const found = levels.find((l) => l.id === activeLevel.value);
  // activeLevel always matches a valid level id; fallback to first for type safety
  return found ?? levels[0]!;
});

function setActiveLevel(id: string): void {
  if (id === activeLevel.value) return;
  activeLevel.value = id;

  // Retrigger CSS animation by toggling animating flag
  animating.value = true;
  nextTick(() => {
    animating.value = false;
  });
}

function handleKeydown(event: KeyboardEvent): void {
  const currentIndex = activeIndex.value;
  let newIndex = currentIndex;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    newIndex = currentIndex < levels.length - 1 ? currentIndex + 1 : 0;
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    newIndex = currentIndex > 0 ? currentIndex - 1 : levels.length - 1;
  } else {
    return;
  }

  const newLevel = levels[newIndex];
  if (!newLevel) return;
  setActiveLevel(newLevel.id);

  // Focus the new tab button
  const tabEl = tabRefs[newLevel.id];
  if (tabEl) {
    tabEl.focus();
  }
}

// Mounted trigger so indicator computes correctly on first render
const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});

// Sliding indicator position (desktop only -- JS-computed from actual DOM)
const indicatorStyle = computed(() => {
  // Access isMounted + activeLevel so computed re-evaluates after mount and on tab change
  if (!isMounted.value) return { opacity: "0" };
  const el = tabRefs[activeLevel.value];
  if (!el) return { opacity: "0" };
  return {
    transform: `translateX(${el.offsetLeft}px)`,
    width: `${el.offsetWidth}px`,
  };
});

// Scroll reveal
const { revealed, elementRef: sectionRef, cleanup } = useScrollReveal();

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section
    id="niveles"
    ref="sectionRef"
    class="levels"
    :class="{ 'is-visible': revealed }"
  >
    <div class="levels__container">
      <!-- HEADER -->
      <span class="levels__tag">Progresi&oacute;n</span>

      <h2 class="levels__title">
        6 niveles de calistenia. Un camino real de progresi&oacute;n.
      </h2>

      <p class="levels__subtitle">
        Cada nivel es una fase real de evoluci&oacute;n. No se salta. No se
        simula. Se entrena, se prueba, se conquista.
      </p>

      <!-- TABS BAR -->
      <div class="levels__tabs" role="tablist">
        <button
          v-for="level in levels"
          :id="'tab-' + level.id"
          :key="level.id"
          :ref="
            (el) => {
              if (el) tabRefs[level.id] = el as HTMLElement;
            }
          "
          role="tab"
          :aria-selected="activeLevel === level.id ? 'true' : 'false'"
          :aria-controls="'panel-' + level.id"
          :tabindex="activeLevel === level.id ? 0 : -1"
          class="levels__tab"
          :class="{ 'levels__tab--active': activeLevel === level.id }"
          @click="setActiveLevel(level.id)"
          @keydown="handleKeydown($event)"
        >
          {{ level.name }}
        </button>

        <!-- Sliding underline indicator (desktop only) -->
        <div class="levels__tabs-indicator" :style="indicatorStyle" />
      </div>

      <!-- TAB PANEL -->
      <div
        :id="'panel-' + activeData.id"
        :key="activeData.id"
        role="tabpanel"
        :aria-labelledby="'tab-' + activeData.id"
        class="levels__panel"
        :class="{ 'levels__panel--animating': animating }"
      >
        <div class="levels__panel-text">
          <h3 class="levels__level-name">{{ activeData.name }}</h3>
          <span class="levels__level-number"
            >Nivel {{ activeData.number }}</span
          >
          <p class="levels__level-headline">{{ activeData.headline }}</p>
          <p class="levels__level-desc">{{ activeData.description }}</p>
          <p class="levels__level-mirror">{{ activeData.mirror }}</p>
          <a href="#descubri-nivel" class="levels__level-cta">
            &iquest;Este sos vos? Reserv&aacute; tu sesi&oacute;n
            <span class="levels__level-cta-arrow">&rarr;</span>
          </a>
        </div>
        <div class="levels__panel-visual">
          <PlaceholderBox
            :label="'Foto nivel ' + activeData.name"
            aspect-ratio="4/5"
          />
        </div>
      </div>

      <!-- FOOTER -->
      <div class="levels__footer">
        <p class="levels__footer-text">
          No importa tu nivel. Lo importante es empezar.
        </p>
        <a href="#descubri-nivel" class="btn btn--primary levels__footer-cta">
          Comenz&aacute; tu camino
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Levels Section -- "Progresi&oacute;n"
   BEM naming. Token variables only. Never pure black or white.
   Interactive 6-level tab system with sliding underline indicator.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section Container
   ------------------------------------------------------------------ */
.levels {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;

  /* Scroll-reveal entrance */
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.levels.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.levels__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.levels__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base);
  text-align: center;
}

.levels__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  text-align: center;
  margin: 0 0 var(--space-comfortable) 0;
}

.levels__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 700px;
  margin: 0 auto var(--space-section) auto;
  text-align: center;
}

/* ------------------------------------------------------------------
   Tabs Bar
   ------------------------------------------------------------------ */
.levels__tabs {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0;
  border-bottom: 1px solid var(--color-warm-stone);
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.levels__tabs::-webkit-scrollbar {
  display: none;
}

/* ------------------------------------------------------------------
   Tab Button
   ------------------------------------------------------------------ */
.levels__tab {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-olive-stone);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 14px 24px;
  cursor: pointer;
  white-space: nowrap;
  transition: var(--transition-base);
}

.levels__tab:hover {
  background: rgba(192, 122, 86, 0.06);
  color: var(--color-deep-charcoal);
}

.levels__tab--active {
  color: var(--color-deep-charcoal);
  /* No per-tab border on desktop -- handled by sliding indicator */
}

.levels__tab:focus-visible {
  outline: 2px solid var(--color-terracotta);
  outline-offset: -2px;
}

/* ------------------------------------------------------------------
   Sliding Indicator (desktop)
   ------------------------------------------------------------------ */
.levels__tabs-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--color-terracotta);
  transition:
    transform 300ms ease,
    width 300ms ease;
  pointer-events: none;
}

/* ------------------------------------------------------------------
   Tab Panel
   ------------------------------------------------------------------ */
.levels__panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-section);
  align-items: center;
  background: var(--color-marble-cream);
  border-radius: var(--radius-card);
  padding: var(--space-section);
  margin-top: var(--space-spacious);
  box-shadow: 0 4px 20px rgba(61, 55, 50, 0.08);
  animation: levelFadeIn 300ms ease;
}

@keyframes levelFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ------------------------------------------------------------------
   Panel Text Column
   ------------------------------------------------------------------ */
.levels__level-name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.levels__level-number {
  display: block;
  font-family: var(--font-clarity);
  font-size: 13px;
  color: var(--color-olive-stone);
  margin-bottom: var(--space-base);
}

.levels__level-headline {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-comfortable) 0;
}

.levels__level-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-comfortable) 0;
}

.levels__level-mirror {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 14px;
  color: var(--color-olive-stone);
  margin: 0 0 var(--space-spacious) 0;
  padding-left: 16px;
  border-left: 2px solid var(--color-terracotta);
}

/* ------------------------------------------------------------------
   Per-Level Ghost CTA
   ------------------------------------------------------------------ */
.levels__level-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-terracotta);
  text-decoration: none;
  transition: var(--transition-base);
}

.levels__level-cta:hover {
  color: var(--color-clay);
  text-decoration: underline;
}

.levels__level-cta-arrow {
  transition: transform var(--transition-base);
}

.levels__level-cta:hover .levels__level-cta-arrow {
  transform: translateX(4px);
}

/* ------------------------------------------------------------------
   Panel Visual Column
   ------------------------------------------------------------------ */
.levels__panel-visual {
  max-height: 450px;
  border-radius: var(--radius-card);
  overflow: hidden;
}

.levels__panel-visual :deep(.placeholder-box) {
  max-height: 450px;
}

/* ------------------------------------------------------------------
   Section Footer
   ------------------------------------------------------------------ */
.levels__footer {
  text-align: center;
  padding-top: var(--space-section);
  margin-top: var(--space-section);
  border-top: 1px solid rgba(61, 55, 50, 0.1);
}

.levels__footer-text {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-comfortable) 0;
}

.levels__footer-cta {
  /* Inherits from .btn.btn--primary */
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .levels {
    padding: var(--space-large) 0;
  }

  .levels__title {
    font-size: 28px;
  }

  .levels__subtitle {
    font-size: 17px;
  }

  /* Tabs: horizontal scroll with snap */
  .levels__tabs {
    justify-content: flex-start;
    scroll-snap-type: x mandatory;
  }

  .levels__tab {
    padding: 12px 16px;
    font-size: 12px;
    scroll-snap-align: start;
    /* Show per-tab border on mobile instead of sliding indicator */
  }

  .levels__tab--active {
    border-bottom-color: var(--color-terracotta);
  }

  /* Hide sliding indicator on mobile */
  .levels__tabs-indicator {
    display: none;
  }

  /* Panel: single column, visual first */
  .levels__panel {
    grid-template-columns: 1fr;
    padding: var(--space-spacious);
  }

  .levels__panel-visual {
    order: -1;
    max-height: 250px;
  }

  .levels__panel-visual :deep(.placeholder-box) {
    aspect-ratio: 16/9 !important;
    max-height: 250px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .levels {
    padding: var(--space-large) 0;
  }

  .levels__title {
    font-size: 24px;
  }

  .levels__level-name {
    font-size: 22px;
  }

  .levels__level-headline {
    font-size: 17px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .levels {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .levels__panel {
    animation: none;
  }

  .levels__tabs-indicator {
    transition: none;
  }

  .levels__level-cta-arrow {
    transition: none;
  }

  .levels__level-cta:hover .levels__level-cta-arrow {
    transform: none;
  }

  .levels__tab {
    transition: none;
  }
}
</style>
