<script setup lang="ts">
/**
 * FlywheelDiagram — Reusable circular flywheel diagram.
 *
 * Props-driven with academy defaults. Desktop: SVG circular diagram
 * with hover tooltips. Mobile: vertical flow with descriptions inline.
 * Scroll-triggered progressive node reveal.
 */

import {
  flywheelNodes as defaultNodes,
  flywheelTools as defaultTools,
} from "~/data/academy";
import type { FlywheelNode, FlywheelTool } from "~/data/academy";

interface FlywheelProps {
  nodes?: FlywheelNode[];
  tools?: FlywheelTool[];
  centerIcon?: "fire" | "logo";
  centerSize?: number;
  closingText?: string;
}

const props = withDefaults(defineProps<FlywheelProps>(), {
  nodes: () => defaultNodes,
  tools: () => defaultTools,
  centerIcon: "fire",
  centerSize: 60,
  closingText: "",
});

const hoveredNode = ref<string | null>(null);

const {
  revealed,
  elementRef: diagramRef,
  cleanup: diagramCleanup,
} = useScrollReveal();

onBeforeUnmount(() => {
  diagramCleanup();
});

// SVG node positions: top, right, bottom, left (clockwise)
const nodePositions = [
  { cx: 200, cy: 60 }, // top — ENTRENÁ
  { cx: 340, cy: 200 }, // right — FORMATE
  { cx: 200, cy: 340 }, // bottom — LIDERÁ
  { cx: 60, cy: 200 }, // left — INVERTÍ
];

// Curved arrow paths between nodes (clockwise)
const arrowPaths = [
  "M 230 75 Q 310 80 325 170", // top -> right
  "M 325 230 Q 310 320 230 325", // right -> bottom
  "M 170 325 Q 90 320 75 230", // bottom -> left
  "M 75 170 Q 90 80 170 75", // left -> top
];
</script>

<template>
  <div
    ref="diagramRef"
    class="flywheel-diagram"
    :class="{ 'is-visible': revealed }"
  >
    <!-- Desktop: SVG Circular Diagram -->
    <div class="flywheel-diagram__desktop">
      <svg
        class="flywheel-diagram__svg"
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- Curved arrows -->
        <g class="flywheel-diagram__arrows">
          <defs>
            <marker
              id="flywheel-arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="rgba(217, 207, 193, 0.6)" />
            </marker>
          </defs>
          <path
            v-for="(path, i) in arrowPaths"
            :key="`arrow-${i}`"
            :d="path"
            fill="none"
            stroke="rgba(217, 207, 193, 0.6)"
            stroke-width="2"
            marker-end="url(#flywheel-arrowhead)"
          />
        </g>

        <!-- Center icon (fire) -->
        <g class="flywheel-diagram__center">
          <text
            x="200"
            y="208"
            text-anchor="middle"
            fill="var(--color-marble-cream)"
            :font-size="props.centerSize * 0.6"
            font-family="var(--font-authority)"
          >
            &#x1F525;
          </text>
        </g>

        <!-- Nodes -->
        <g
          v-for="(node, index) in props.nodes"
          :key="node.id"
          class="flywheel-diagram__node"
          :class="{ 'flywheel-diagram__node--revealed': revealed }"
          :style="{ transitionDelay: revealed ? `${index * 200}ms` : '0ms' }"
          @mouseenter="hoveredNode = node.id"
          @mouseleave="hoveredNode = null"
        >
          <!-- Node circle -->
          <circle
            :cx="nodePositions[index].cx"
            :cy="nodePositions[index].cy"
            r="35"
            :fill="node.color"
            :stroke="
              node.color === 'var(--color-deep-charcoal)'
                ? 'var(--color-warm-stone)'
                : 'none'
            "
            :stroke-width="
              node.color === 'var(--color-deep-charcoal)' ? '1' : '0'
            "
            class="flywheel-diagram__circle"
          />

          <!-- Node title -->
          <text
            :x="nodePositions[index].cx"
            :y="nodePositions[index].cy + 5"
            text-anchor="middle"
            fill="var(--color-marble-cream)"
            font-size="11"
            font-family="var(--font-clarity)"
            font-weight="600"
            letter-spacing="0.06em"
          >
            {{ node.title }}
          </text>
        </g>
      </svg>

      <!-- Hover tooltip -->
      <div v-if="hoveredNode" class="flywheel-diagram__tooltip">
        <p>
          {{ props.nodes.find((n) => n.id === hoveredNode)?.description }}
        </p>
      </div>
    </div>

    <!-- Mobile: Vertical Flow -->
    <div class="flywheel-diagram__mobile">
      <div
        v-for="(node, index) in props.nodes"
        :key="`mobile-${node.id}`"
        class="flywheel-diagram__mobile-item"
        :class="{ 'flywheel-diagram__mobile-item--revealed': revealed }"
        :style="{ transitionDelay: revealed ? `${index * 200}ms` : '0ms' }"
      >
        <div
          class="flywheel-diagram__mobile-border"
          :style="{ borderLeftColor: node.color }"
        />
        <div class="flywheel-diagram__mobile-content">
          <h4 class="flywheel-diagram__mobile-title">{{ node.title }}</h4>
          <p class="flywheel-diagram__mobile-desc">{{ node.description }}</p>
        </div>

        <!-- Arrow between items -->
        <div
          v-if="index < props.nodes.length - 1"
          class="flywheel-diagram__mobile-arrow"
        >
          <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
            <path
              d="M8 2v18M3 16l5 5 5-5"
              stroke="rgba(217, 207, 193, 0.6)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- Cycle arrow: back to top -->
      <div class="flywheel-diagram__mobile-cycle">
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
          <path
            d="M8 22V4M3 8l5-5 5 5"
            stroke="rgba(217, 207, 193, 0.6)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="flywheel-diagram__mobile-cycle-text"
          >Tus alumnos arrancan de nuevo</span
        >
      </div>
    </div>

    <!-- Tools row -->
    <div v-if="props.tools.length > 0" class="flywheel-diagram__tools">
      <div
        v-for="tool in props.tools"
        :key="tool.name"
        class="flywheel-diagram__tool"
      >
        <span class="flywheel-diagram__tool-name">{{ tool.name }}</span>
        <span class="flywheel-diagram__tool-desc">{{ tool.description }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   FlywheelDiagram — Reusable Circular Flywheel Component
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.flywheel-diagram {
  width: 100%;
}

/* ------------------------------------------------------------------
   Desktop SVG Diagram
   ------------------------------------------------------------------ */
.flywheel-diagram__desktop {
  position: relative;
  max-width: 400px;
  margin: 0 auto;
}

.flywheel-diagram__svg {
  width: 100%;
  height: auto;
}

/* Node reveal animation */
.flywheel-diagram__node {
  opacity: 0;
  transform-origin: center;
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
  cursor: pointer;
}

.flywheel-diagram__node--revealed {
  opacity: 1;
}

.flywheel-diagram__circle {
  transition: filter 0.2s ease;
}

.flywheel-diagram__node:hover .flywheel-diagram__circle {
  filter: brightness(1.15);
}

/* ------------------------------------------------------------------
   Tooltip
   ------------------------------------------------------------------ */
.flywheel-diagram__tooltip {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(61, 55, 50, 0.95);
  border: 1px solid rgba(217, 207, 193, 0.3);
  border-radius: var(--radius-base);
  padding: 12px 16px;
  max-width: 280px;
  z-index: 10;
}

.flywheel-diagram__tooltip p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-warm-stone);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Mobile Vertical Flow
   ------------------------------------------------------------------ */
.flywheel-diagram__mobile {
  display: none;
}

.flywheel-diagram__mobile-item {
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}

.flywheel-diagram__mobile-item--revealed {
  opacity: 1;
  transform: translateY(0);
}

.flywheel-diagram__mobile-content {
  border-left: 4px solid var(--color-warm-stone);
  padding: 12px 0 12px 16px;
}

.flywheel-diagram__mobile-border {
  display: none;
}

.flywheel-diagram__mobile-title {
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 15px;
  color: var(--color-marble-cream);
  letter-spacing: 0.06em;
  margin: 0 0 4px 0;
}

.flywheel-diagram__mobile-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-warm-stone);
  line-height: 1.5;
  margin: 0;
}

.flywheel-diagram__mobile-arrow {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.flywheel-diagram__mobile-cycle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0 0 0;
}

.flywheel-diagram__mobile-cycle-text {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 14px;
  color: var(--color-warm-stone);
}

/* ------------------------------------------------------------------
   Tools Row
   ------------------------------------------------------------------ */
.flywheel-diagram__tools {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-base);
  margin-top: var(--space-spacious);
  padding-top: var(--space-comfortable);
  border-top: 1px solid rgba(217, 207, 193, 0.15);
}

.flywheel-diagram__tool {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.flywheel-diagram__tool-name {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  color: var(--color-warm-stone);
}

.flywheel-diagram__tool-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 12px;
  color: rgba(217, 207, 193, 0.6);
  line-height: 1.4;
}

/* ------------------------------------------------------------------
   Responsive: Mobile
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .flywheel-diagram__desktop {
    display: none;
  }

  .flywheel-diagram__mobile {
    display: block;
  }

  .flywheel-diagram__tools {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-comfortable);
  }

  .flywheel-diagram__tool {
    text-align: left;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .flywheel-diagram__node {
    opacity: 1;
    transition: none;
  }

  .flywheel-diagram__mobile-item {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
