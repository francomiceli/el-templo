<script setup lang="ts">
/**
 * TreeMapPage — canvas "mapa del árbol" view of the skill tree (Vue Flow).
 *
 * Same data + mutations as TreeEditorPage (useTreeEditorApi → /admin/tree-editor),
 * different presentation: routes are nodes on a pannable/zoomable canvas; clicking
 * a route expands its escalera (chain) in place; a MiniMap gives the overview.
 *
 * Editing gestures map 1:1 to the existing endpoints:
 *  - drag an exercise along its chain → POST /reorder (manual chain, locked)
 *  - drag a connection between exercises of DIFFERENT routes → POST /precedence add
 *  - click a manual precedence edge → confirm → POST /precedence remove
 *  - side panel "Reasignar ruta" → POST /regroup
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core';
import type { Connection, Edge, Node, NodeMouseEvent, EdgeMouseEvent } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import { useTreeEditorApi } from 'src/composables/useTreeEditorApi';
import { useProposalsApi } from 'src/composables/useProposalsApi';
import type { EditableTree, Effort } from 'src/types/tree-editor';
import type { Proposal, RouteProgressionMap, AcceptOverrides } from 'src/types/proposal';
import RouteFlowNode from 'components/treemap/RouteFlowNode.vue';
import type { RouteNodeData } from 'components/treemap/RouteFlowNode.vue';
import ExerciseFlowNode from 'components/treemap/ExerciseFlowNode.vue';
import type { ExerciseNodeData } from 'components/treemap/ExerciseFlowNode.vue';
import CategoryFlowNode from 'components/treemap/CategoryFlowNode.vue';
import type { CategoryNodeData } from 'components/treemap/CategoryFlowNode.vue';
import { DL_BANDS, bandTextClass, type DlBand } from 'src/constants/levels';

type FlowNodeData = RouteNodeData | ExerciseNodeData | CategoryNodeData;
type FlowNode = Node<FlowNodeData>;

const EFFORTS: Effort[] = ['CON', 'EXC', 'ISO'];

// ── Layout constants (manual layout: chains are linear, no graph engine needed) ──
// Stacked-band layout: categories are horizontal BANDS stacked TOP→BOTTOM
// (Tracción first, then Empuje, …); inside a band the routes run LEFT→RIGHT
// (one column each) and an expanded chain grows DOWN under its own route. A
// band's height adapts to its longest expanded chain, so expanding a route
// pushes the bands below instead of overlapping them.
const LAYOUT = {
  routeColW: 270, // column width per route
  bandGap: 110, // vertical gap between category bands
  catH: 56, // space under the category title
  routeH: 76, // route node row height
  chainIndent: 20, // x offset of the chain relative to its route node (centers 200 under 240)
  chainTopGap: 14, // gap between the route node and the first chain step
  stepY: 86, // vertical distance between chain steps
} as const;

const AUTO_COLOR = '#9e9e9e';
const MANUAL_COLOR = '#96593a'; // $primary (terracotta)

const $q = useQuasar();
const treeApi = useTreeEditorApi();
const proposalsApi = useProposalsApi();
const { setCenter } = useVueFlow();

const tree = ref<EditableTree | null>(null);
const selectedEffort = ref<Effort>('CON');
const expandedRoutes = ref<Set<string>>(new Set());
const selectedExercise = ref<ExerciseNodeData | null>(null);
const nodes = ref<FlowNode[]>([]);
const edges = ref<Edge[]>([]);

// Reassign-route dialog state
const reassignOpen = ref(false);
const reassignTarget = ref<{ label: string; value: string } | null>(null);

// Search state
const searchFilter = ref('');

// ── Proposal review state (Revisión de dimensiones absorbed into the map) ─────
const proposals = ref<Proposal[]>([]);
const routeMap = ref<RouteProgressionMap>({});
/** routes.code whose pending proposals are open in the review drawer (null = closed). */
const reviewRoute = ref<string | null>(null);
const proposalBusyId = ref<number | null>(null);
const bulkBusy = ref(false);

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadTree(): Promise<void> {
  try {
    tree.value = await treeApi.fetchTree();
    // Drop expanded/selected state that no longer exists after a refetch.
    const routeCodes = new Set(tree.value.categories.flatMap((c) => c.routes.map((r) => r.route)));
    expandedRoutes.value = new Set([...expandedRoutes.value].filter((r) => routeCodes.has(r)));
    if (selectedExercise.value && !findChainOf(selectedExercise.value.route)) {
      selectedExercise.value = null;
    }
    rebuildGraph();
  } catch {
    // fetchTree already notified + logged; keep the previous canvas.
  }
}

/** Load pending proposals (badges) + the per-route progression map (selects). */
async function loadProposals(): Promise<void> {
  try {
    const [list, map] = await Promise.all([
      proposalsApi.fetchProposals({ status: 'pending' }),
      proposalsApi.fetchRouteMap(),
    ]);
    proposals.value = list.proposals;
    routeMap.value = map;
    rebuildGraph();
  } catch {
    // composable already notified; keep previous proposal state.
  }
}

/** Effective route key of a proposal (proposed route wins while route is pending). */
function proposalRouteKey(p: Proposal): string {
  const raw = p.routePending && p.proposedRoute ? p.proposedRoute : p.currentRoute;
  return raw.trim().toUpperCase();
}

const pendingByRoute = computed<Map<string, Proposal[]>>(() => {
  const grouped = new Map<string, Proposal[]>();
  for (const p of proposals.value) {
    const key = proposalRouteKey(p);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(p);
    else grouped.set(key, [p]);
  }
  return grouped;
});

/** The selected-effort partition node list of a route, or null. */
function findChainOf(routeCode: string) {
  const t = tree.value;
  if (!t) return null;
  for (const cat of t.categories) {
    const rt = cat.routes.find((r) => r.route === routeCode);
    if (rt) return rt.partitions.find((p) => p.effort === selectedEffort.value) ?? null;
  }
  return null;
}

// ── Graph construction (tree + expanded + effort → nodes/edges) ───────────────

function rebuildGraph(): void {
  const t = tree.value;
  if (!t) {
    nodes.value = [];
    edges.value = [];
    return;
  }

  const ns: FlowNode[] = [];
  const es: Edge[] = [];

  let bandY = 0;
  for (const cat of t.categories) {
    ns.push({
      id: `cat-${cat.key}`,
      type: 'category',
      position: { x: 0, y: bandY },
      data: { label: cat.label },
      draggable: false,
      selectable: false,
      focusable: false,
    });

    // The band must clear its longest expanded chain before the next one starts.
    let maxChainLen = 0;

    cat.routes.forEach((rt, routeIndex) => {
      const part = rt.partitions.find((p) => p.effort === selectedEffort.value);
      const chain = part?.nodes ?? [];
      const isExpanded = expandedRoutes.value.has(rt.route) && chain.length > 0;
      if (isExpanded) maxChainLen = Math.max(maxChainLen, chain.length);
      const routeX = routeIndex * LAYOUT.routeColW;
      const routeY = bandY + LAYOUT.catH;

      ns.push({
        id: `route-${rt.route}`,
        type: 'route',
        position: { x: routeX, y: routeY },
        data: {
          name: rt.name,
          code: rt.route,
          count: chain.length,
          overridden: part?.overridden ?? false,
          expanded: isExpanded,
          pendingCount: pendingByRoute.value.get(rt.route.trim().toUpperCase())?.length ?? 0,
        },
        draggable: false,
      });

      if (isExpanded) {
        const chainY0 = routeY + LAYOUT.routeH + LAYOUT.chainTopGap;
        const manual = part?.overridden ?? false;
        let prevId: string | null = null;
        chain.forEach((ex, i) => {
          const id = `ex-${ex.exerciseId}`;
          ns.push({
            id,
            type: 'exercise',
            position: { x: routeX + LAYOUT.chainIndent, y: chainY0 + i * LAYOUT.stepY },
            data: {
              exerciseId: ex.exerciseId,
              name: ex.name,
              dl: ex.dificultadLineal,
              orderSource: ex.orderSource,
              route: rt.route,
              effort: selectedEffort.value,
              stepIndex: i,
            },
          });
          if (prevId === null) {
            es.push({
              id: `start-${rt.route}`,
              source: `route-${rt.route}`,
              target: id,
              style: { stroke: '#bdbdbd', strokeDasharray: '6 4' },
            });
          } else {
            es.push({
              id: `chain-${prevId}-${id}`,
              source: prevId,
              target: id,
              style: { stroke: manual ? MANUAL_COLOR : AUTO_COLOR, strokeWidth: 2 },
              markerEnd: MarkerType.ArrowClosed,
            });
          }
          prevId = id;
        });
      }
    });

    bandY +=
      LAYOUT.catH +
      LAYOUT.routeH +
      (maxChainLen > 0 ? LAYOUT.chainTopGap + maxChainLen * LAYOUT.stepY : 0) +
      LAYOUT.bandGap;
  }

  // Cross-route precedence edges — only when both endpoints are on the canvas.
  const visibleExercises = new Set(ns.filter((n) => n.type === 'exercise').map((n) => n.id));
  for (const pe of t.precedenceEdges) {
    const source = `ex-${pe.fromExerciseId}`;
    const target = `ex-${pe.toExerciseId}`;
    if (visibleExercises.has(source) && visibleExercises.has(target)) {
      es.push({
        id: `prec-${pe.fromExerciseId}-${pe.toExerciseId}`,
        source,
        target,
        animated: true,
        style: { stroke: pe.source === 'manual' ? MANUAL_COLOR : AUTO_COLOR, strokeWidth: 2 },
        markerEnd: MarkerType.ArrowClosed,
        data: {
          precedence: true,
          edgeSource: pe.source,
          from: pe.fromExerciseId,
          to: pe.toExerciseId,
        },
      });
    }
  }

  nodes.value = ns;
  edges.value = es;
}

// ── Canvas interactions ───────────────────────────────────────────────────────

function onNodeClick(event: NodeMouseEvent): void {
  const node = event.node as FlowNode;
  if (node.type === 'route') {
    const data = node.data as RouteNodeData;
    if (data.count === 0) return;
    toggleRoute(data.code);
  } else if (node.type === 'exercise') {
    reviewRoute.value = null;
    selectedExercise.value = node.data as ExerciseNodeData;
  }
}

function toggleRoute(code: string): void {
  const next = new Set(expandedRoutes.value);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  expandedRoutes.value = next;
  rebuildGraph();
}

function collapseAll(): void {
  expandedRoutes.value = new Set();
  selectedExercise.value = null;
  rebuildGraph();
}

function onEffortChange(): void {
  selectedExercise.value = null;
  rebuildGraph();
}

/**
 * Drag-reorder: when an exercise node is dropped, recompute its chain order by
 * y position (the dragged node uses its dropped y; siblings keep their layout y,
 * read from the generated nodes) and persist via /reorder. Any no-op drop just
 * snaps the layout back.
 */
async function onNodeDragStop(event: { node: Node }): Promise<void> {
  const node = event.node as FlowNode;
  if (node.type !== 'exercise') return;
  const data = node.data as ExerciseNodeData;
  const part = findChainOf(data.route);
  if (!part || part.nodes.length < 2) {
    rebuildGraph();
    return;
  }

  const layoutY = new Map(
    nodes.value.filter((n) => n.type === 'exercise').map((n) => [n.id, n.position.y])
  );
  const withY = part.nodes.map((ex) => ({
    exerciseId: ex.exerciseId,
    y:
      ex.exerciseId === data.exerciseId
        ? node.position.y
        : (layoutY.get(`ex-${ex.exerciseId}`) ?? 0),
  }));
  withY.sort((a, b) => a.y - b.y);
  const ordered = withY.map((w) => w.exerciseId);
  const current = part.nodes.map((ex) => ex.exerciseId);

  if (ordered.join(',') === current.join(',')) {
    rebuildGraph(); // snap back (y drift / no-op drag)
    return;
  }

  try {
    await treeApi.reorderPartition({
      route: data.route,
      effort: selectedEffort.value,
      orderedExerciseIds: ordered,
    });
    $q.notify({ type: 'positive', message: 'Orden manual guardado' });
    await loadTree();
  } catch {
    rebuildGraph(); // snap back; the composable already notified the error
  }
}

/** Side-panel fallback for reorder: move the selected exercise one step. */
async function moveSelected(delta: -1 | 1): Promise<void> {
  const sel = selectedExercise.value;
  if (!sel) return;
  const part = findChainOf(sel.route);
  if (!part) return;
  const ids = part.nodes.map((ex) => ex.exerciseId);
  const idx = ids.indexOf(sel.exerciseId);
  const swapWith = idx + delta;
  if (idx === -1 || swapWith < 0 || swapWith >= ids.length) return;
  const next = ids.slice();
  const a = next[idx];
  const b = next[swapWith];
  if (a === undefined || b === undefined) return;
  next[idx] = b;
  next[swapWith] = a;
  try {
    await treeApi.reorderPartition({
      route: sel.route,
      effort: selectedEffort.value,
      orderedExerciseIds: next,
    });
    $q.notify({ type: 'positive', message: 'Orden manual guardado' });
    await loadTree();
  } catch {
    // composable already notified
  }
}

/** Connecting two exercises of different routes creates a manual precedence. */
function onConnect(connection: Connection): void {
  const sourceNode = nodes.value.find((n) => n.id === connection.source);
  const targetNode = nodes.value.find((n) => n.id === connection.target);
  if (sourceNode?.type !== 'exercise' || targetNode?.type !== 'exercise') return;
  const from = sourceNode.data as ExerciseNodeData;
  const to = targetNode.data as ExerciseNodeData;
  if (from.exerciseId === to.exerciseId) return;
  if (from.route === to.route) {
    $q.notify({
      type: 'info',
      message: 'Dentro de una misma ruta el orden se cambia arrastrando el ejercicio',
    });
    return;
  }
  $q.dialog({
    title: 'Crear precedencia manual',
    message: `"${from.name}" pasa a ser requisito de "${to.name}". ¿Confirmás?`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Crear', color: 'primary' },
  }).onOk(() => {
    void (async () => {
      try {
        await treeApi.setPrecedence({
          fromExerciseId: from.exerciseId,
          toExerciseId: to.exerciseId,
          op: 'add',
        });
        $q.notify({ type: 'positive', message: 'Precedencia creada' });
        await loadTree();
      } catch {
        // composable already notified
      }
    })();
  });
}

/** Clicking a MANUAL precedence edge offers to remove it. */
function onEdgeClick(event: EdgeMouseEvent): void {
  const data = event.edge.data as
    | { precedence?: boolean; edgeSource?: string; from?: number; to?: number }
    | undefined;
  if (!data?.precedence || typeof data.from !== 'number' || typeof data.to !== 'number') return;
  if (data.edgeSource !== 'manual') {
    $q.notify({ type: 'info', message: 'Esta precedencia es automática (no se borra desde acá)' });
    return;
  }
  const from = data.from;
  const to = data.to;
  $q.dialog({
    title: 'Eliminar precedencia manual',
    message: '¿Eliminar esta precedencia entre ramas?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(() => {
    void (async () => {
      try {
        await treeApi.setPrecedence({ fromExerciseId: from, toExerciseId: to, op: 'remove' });
        $q.notify({ type: 'positive', message: 'Precedencia eliminada' });
        await loadTree();
      } catch {
        // composable already notified
      }
    })();
  });
}

// ── Proposal review drawer (Revisión de dimensiones) ─────────────────────────

/** Pending proposals of the route open in the drawer. */
const reviewRows = computed<Proposal[]>(() => {
  if (!reviewRoute.value) return [];
  return pendingByRoute.value.get(reviewRoute.value.trim().toUpperCase()) ?? [];
});

const reviewRouteName = computed(() => {
  const t = tree.value;
  if (!t || !reviewRoute.value) return reviewRoute.value ?? '';
  const rt = t.categories.flatMap((c) => c.routes).find((r) => r.route === reviewRoute.value);
  return rt?.name ?? reviewRoute.value;
});

function openReview(code: string): void {
  selectedExercise.value = null;
  reviewRoute.value = code;
  // Expand the route so accepted exercises appear in the chain right away.
  if (!expandedRoutes.value.has(code)) {
    expandedRoutes.value = new Set([...expandedRoutes.value, code]);
    rebuildGraph();
  }
}

function closeReview(): void {
  reviewRoute.value = null;
}

/** Ordered step-token options for a proposal's route (empty = linear/excluded). */
function stepOptionsFor(p: Proposal): { label: string; value: number }[] {
  const info = routeMap.value[proposalRouteKey(p)];
  if (!info || info.strategy !== 'token') return [];
  return info.steps.map((token, i) => ({ label: `${i} · ${token}`, value: i }));
}

/** Habilidad vocab options for a proposal's route (free typing still allowed). */
function habilidadOptionsFor(p: Proposal): string[] {
  return routeMap.value[proposalRouteKey(p)]?.habilidades ?? [];
}

/** A token-strategy proposal with no resolved step still needs a profe choice. */
function isUnmatched(p: Proposal): boolean {
  const info = routeMap.value[proposalRouteKey(p)];
  return !!info && info.strategy === 'token' && p.proposedStep === null;
}

/** Accept-override body from the (possibly edited) row — same shape as the old page. */
function overridesFor(p: Proposal): AcceptOverrides {
  const overrides: AcceptOverrides = {
    proposedStep: p.proposedStep,
    proposedHabilidad: p.proposedHabilidad,
  };
  if (p.routePending && p.proposedRoute) overrides.proposedRoute = p.proposedRoute;
  return overrides;
}

async function acceptOne(p: Proposal): Promise<void> {
  proposalBusyId.value = p.id;
  try {
    await proposalsApi.acceptProposal(p.id, overridesFor(p));
    $q.notify({ type: 'positive', message: `"${p.exerciseName}" aceptado` });
    await Promise.all([loadProposals(), loadTree()]);
  } catch {
    // composable already notified
  } finally {
    proposalBusyId.value = null;
  }
}

async function rejectOne(p: Proposal): Promise<void> {
  proposalBusyId.value = p.id;
  try {
    await proposalsApi.rejectProposal(p.id);
    $q.notify({ type: 'info', message: `"${p.exerciseName}" rechazado` });
    await loadProposals();
  } catch {
    // composable already notified
  } finally {
    proposalBusyId.value = null;
  }
}

function bulkAcceptRoute(): void {
  const rows = reviewRows.value;
  if (rows.length === 0) return;
  $q.dialog({
    title: 'Aceptar todas',
    message: `Se aceptan las ${rows.length} propuestas pendientes de ${reviewRouteName.value} tal como están. ¿Confirmás?`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Aceptar todas', color: 'primary' },
  }).onOk(() => {
    void (async () => {
      bulkBusy.value = true;
      try {
        const res = await proposalsApi.bulkAccept(rows.map((r) => r.id));
        $q.notify({ type: 'positive', message: `${res.acceptedCount} propuestas aceptadas` });
        await Promise.all([loadProposals(), loadTree()]);
      } catch {
        // composable already notified
      } finally {
        bulkBusy.value = false;
      }
    })();
  });
}

// ── Reassign route (side panel action) ────────────────────────────────────────

const routeOptions = computed(() => {
  const t = tree.value;
  if (!t) return [];
  return t.categories
    .flatMap((c) => c.routes)
    .filter((r) => r.route !== selectedExercise.value?.route)
    .map((r) => ({ label: `${r.name} (${r.route})`, value: r.route }));
});

async function confirmReassign(): Promise<void> {
  const sel = selectedExercise.value;
  const target = reassignTarget.value;
  if (!sel || !target) return;
  try {
    await treeApi.regroup({ exerciseIds: [sel.exerciseId], targetRoute: target.value });
    $q.notify({ type: 'positive', message: `Ejercicio movido a ${target.label}` });
    reassignOpen.value = false;
    reassignTarget.value = null;
    selectedExercise.value = null;
    await loadTree();
  } catch {
    // composable already notified
  }
}

// ── Search (expand + center on an exercise) ───────────────────────────────────

interface SearchOption {
  label: string;
  value: number;
  route: string;
}

const allSearchOptions = computed<SearchOption[]>(() => {
  const t = tree.value;
  if (!t) return [];
  const opts: SearchOption[] = [];
  for (const cat of t.categories) {
    for (const rt of cat.routes) {
      const part = rt.partitions.find((p) => p.effort === selectedEffort.value);
      for (const ex of part?.nodes ?? []) {
        opts.push({ label: `${ex.name} · ${rt.route}`, value: ex.exerciseId, route: rt.route });
      }
    }
  }
  return opts;
});

const filteredSearchOptions = computed(() => {
  const needle = searchFilter.value.trim().toLowerCase();
  if (needle.length < 2) return [];
  return allSearchOptions.value.filter((o) => o.label.toLowerCase().includes(needle)).slice(0, 30);
});

function onSearchFilter(input: string, update: (fn: () => void) => void): void {
  update(() => {
    searchFilter.value = input;
  });
}

async function onSearchSelect(opt: SearchOption | null): Promise<void> {
  if (!opt) return;
  if (!expandedRoutes.value.has(opt.route)) {
    expandedRoutes.value = new Set([...expandedRoutes.value, opt.route]);
    rebuildGraph();
  }
  await nextTick();
  const node = nodes.value.find((n) => n.id === `ex-${opt.value}`);
  if (node) {
    await setCenter(node.position.x + 100, node.position.y + 28, { zoom: 1.1, duration: 600 });
    selectedExercise.value = node.data as ExerciseNodeData;
  }
}

// ── MiniMap coloring ──────────────────────────────────────────────────────────

function minimapColor(node: Node): string {
  if (node.type === 'route') return MANUAL_COLOR;
  if (node.type === 'exercise') return '#d4d4d4';
  return 'transparent';
}

// ── Leyenda de bandas de dificultad (R2-BANDS) ────────────────────────────────

/** Label compacto de la leyenda: `kairos 1–2`, `alfa 3`, `delta 4–6`, … */
function bandLegendLabel(band: DlBand): string {
  return band.min === band.max
    ? `${band.level} ${band.min}`
    : `${band.level} ${band.min}–${band.max}`;
}

// ── Page sizing ───────────────────────────────────────────────────────────────

/**
 * The canvas gets EXACTLY the viewport height remaining below its own top edge,
 * measured at runtime. A CSS calc against the header is not enough: the layout
 * can render extra siblings above the page (e.g. the low-sessions q-banner in
 * AdminLayout's q-page-container), which would push the canvas bottom — and the
 * MiniMap/Controls — below the fold. Re-measured on window resize and on any
 * body reflow (banner appearing/disappearing).
 */
const canvasEl = ref<HTMLElement | null>(null);
const canvasHeight = ref(600);
let resizeObserver: ResizeObserver | null = null;

function recomputeCanvasHeight(): void {
  const el = canvasEl.value;
  if (!el) return;
  canvasHeight.value = Math.max(window.innerHeight - el.getBoundingClientRect().top, 320);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  recomputeCanvasHeight();
  resizeObserver = new ResizeObserver(recomputeCanvasHeight);
  resizeObserver.observe(document.body);
  window.addEventListener('resize', recomputeCanvasHeight);
  void loadTree();
  void loadProposals();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', recomputeCanvasHeight);
  treeApi.cleanup();
});
</script>

<template>
  <q-page class="tree-map-page">
    <!-- Toolbar -->
    <div class="tree-map-toolbar row items-center q-gutter-sm q-px-md q-py-sm">
      <div class="text-h6">Árbol de ejercicios</div>

      <q-btn-toggle
        :model-value="selectedEffort"
        :options="EFFORTS.map((e) => ({ label: e, value: e }))"
        dense
        unelevated
        toggle-color="primary"
        color="grey-3"
        text-color="grey-8"
        @update:model-value="
          (v: Effort) => {
            selectedEffort = v;
            onEffortChange();
          }
        "
      />

      <q-select
        :model-value="null"
        :options="filteredSearchOptions"
        use-input
        hide-dropdown-icon
        dense
        outlined
        clearable
        input-debounce="200"
        placeholder="Buscar ejercicio…"
        class="tree-map-toolbar__search"
        @filter="onSearchFilter"
        @update:model-value="onSearchSelect"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
        <template #no-option>
          <q-item dense>
            <q-item-section class="text-grey-6">Escribí al menos 2 letras</q-item-section>
          </q-item>
        </template>
      </q-select>

      <q-space />

      <!-- Leyenda de bandas de dificultad (R2-BANDS) — colapsa a botón palette en viewport angosto -->
      <div v-if="$q.screen.width >= 1100" class="row items-center q-gutter-xs">
        <q-badge
          v-for="legendBand in DL_BANDS"
          :key="legendBand.level"
          :color="legendBand.color"
          :class="bandTextClass(legendBand)"
          :label="bandLegendLabel(legendBand)"
        />
      </div>
      <q-btn v-else flat dense round icon="palette" aria-label="Leyenda de bandas de dificultad">
        <q-menu>
          <div class="column q-pa-sm q-gutter-xs">
            <q-badge
              v-for="legendBand in DL_BANDS"
              :key="legendBand.level"
              :color="legendBand.color"
              :class="bandTextClass(legendBand)"
              :label="bandLegendLabel(legendBand)"
            />
          </div>
        </q-menu>
      </q-btn>

      <div class="row items-center q-gutter-xs text-caption text-grey-7">
        <q-badge color="grey-6" label="Auto" />
        <q-badge color="primary" label="Manual" />
        <q-badge v-if="proposals.length > 0" color="orange-8">
          {{ proposals.length }} por revisar
          <q-tooltip
            >Propuestas de dimensiones pendientes — click en el badge de una ruta</q-tooltip
          >
        </q-badge>
      </div>

      <q-btn flat dense icon="unfold_less" label="Colapsar" no-caps @click="collapseAll" />
      <q-btn
        flat
        dense
        round
        icon="refresh"
        :loading="treeApi.loading.value"
        aria-label="Recargar"
        @click="loadTree"
      />
    </div>

    <!-- Canvas (height measured at runtime — see recomputeCanvasHeight) -->
    <div ref="canvasEl" class="tree-map-canvas" :style="{ height: `${canvasHeight}px` }">
      <VueFlow
        :nodes="nodes"
        :edges="edges"
        :min-zoom="0.08"
        :max-zoom="2"
        :default-viewport="{ x: 24, y: 16, zoom: 0.9 }"
        @node-click="onNodeClick"
        @node-drag-stop="onNodeDragStop"
        @connect="onConnect"
        @edge-click="onEdgeClick"
      >
        <Background pattern-color="#ddd" :gap="24" />
        <Controls />
        <MiniMap pannable zoomable :node-color="minimapColor" />

        <template #node-category="props">
          <CategoryFlowNode :data="props.data" />
        </template>
        <template #node-route="props">
          <RouteFlowNode :data="props.data" @review="openReview(props.data.code)" />
        </template>
        <template #node-exercise="props">
          <ExerciseFlowNode :data="props.data" :selected="props.selected" />
        </template>
      </VueFlow>

      <!-- Review drawer: pending dimension proposals of one route -->
      <q-card v-if="reviewRoute" class="tree-map-review" flat bordered>
        <q-card-section class="q-pb-xs">
          <div class="row items-center no-wrap">
            <div class="col">
              <div class="text-subtitle2">Revisión — {{ reviewRouteName }}</div>
              <div class="text-caption text-grey-7">
                {{ reviewRows.length }} propuestas pendientes
              </div>
            </div>
            <q-btn
              dense
              outline
              color="primary"
              size="sm"
              no-caps
              label="Aceptar todas"
              :loading="bulkBusy"
              :disable="reviewRows.length === 0"
              class="q-mr-sm"
              @click="bulkAcceptRoute"
            />
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="close"
              aria-label="Cerrar"
              @click="closeReview"
            />
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="tree-map-review__list q-pa-none">
          <div v-if="reviewRows.length === 0" class="q-pa-md text-grey-6 text-caption">
            No quedan propuestas pendientes en esta ruta 🎉
          </div>
          <q-list v-else separator>
            <q-item v-for="row in reviewRows" :key="row.id" class="column q-py-sm">
              <div class="row items-center no-wrap full-width">
                <div class="col text-body2 text-weight-medium">
                  {{ row.exerciseName }}
                  <q-badge
                    v-if="isUnmatched(row)"
                    color="orange-8"
                    label="sin escalón"
                    class="q-ml-xs"
                  />
                </div>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="check"
                  color="positive"
                  :loading="proposalBusyId === row.id"
                  aria-label="Aceptar"
                  @click="acceptOne(row)"
                >
                  <q-tooltip>Aceptar</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="close"
                  color="negative"
                  :loading="proposalBusyId === row.id"
                  aria-label="Rechazar"
                  @click="rejectOne(row)"
                >
                  <q-tooltip>Rechazar</q-tooltip>
                </q-btn>
              </div>
              <div class="row q-col-gutter-sm q-mt-xs full-width">
                <div class="col-6">
                  <q-select
                    v-if="stepOptionsFor(row).length > 0"
                    :model-value="row.proposedStep"
                    :options="stepOptionsFor(row)"
                    label="Escalón"
                    dense
                    outlined
                    clearable
                    emit-value
                    map-options
                    @update:model-value="(v: number | null) => (row.proposedStep = v)"
                  />
                  <div v-else class="text-caption text-grey-6 q-pt-sm">
                    ruta lineal (sin tokens)
                  </div>
                </div>
                <div class="col-6">
                  <q-select
                    :model-value="row.proposedHabilidad"
                    :options="habilidadOptionsFor(row)"
                    label="Habilidad"
                    dense
                    outlined
                    clearable
                    use-input
                    new-value-mode="add-unique"
                    @update:model-value="(v: string | null) => (row.proposedHabilidad = v)"
                  />
                </div>
              </div>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>

      <!-- Side panel: selected exercise -->
      <q-card v-if="selectedExercise" class="tree-map-panel" flat bordered>
        <q-card-section class="q-pb-xs">
          <div class="row items-start no-wrap">
            <div class="col">
              <div class="text-subtitle2">{{ selectedExercise.name }}</div>
              <div class="text-caption text-grey-7">
                {{ selectedExercise.route }} · {{ selectedExercise.effort }} · escalón
                {{ selectedExercise.stepIndex + 1 }} · dl {{ selectedExercise.dl ?? '—' }}
                <q-badge
                  :color="selectedExercise.orderSource === 'manual' ? 'primary' : 'grey-6'"
                  :label="selectedExercise.orderSource === 'manual' ? 'Manual' : 'Auto'"
                  class="q-ml-xs"
                />
              </div>
            </div>
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="close"
              aria-label="Cerrar"
              @click="selectedExercise = null"
            />
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="q-gutter-sm">
          <div class="text-caption text-grey-7">Mover en la escalera</div>
          <div class="row q-gutter-sm">
            <q-btn
              dense
              outline
              icon="arrow_upward"
              label="Más fácil"
              no-caps
              size="sm"
              @click="moveSelected(-1)"
            />
            <q-btn
              dense
              outline
              icon-right="arrow_downward"
              label="Más difícil"
              no-caps
              size="sm"
              @click="moveSelected(1)"
            />
          </div>
          <q-btn
            dense
            outline
            color="primary"
            icon="alt_route"
            label="Reasignar ruta"
            no-caps
            size="sm"
            class="full-width"
            @click="reassignOpen = true"
          />
          <div class="text-caption text-grey-6">
            Tip: también podés arrastrar el ejercicio a otra posición de su escalera, o dibujar una
            flecha hacia un ejercicio de otra rama para crear una precedencia.
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Reassign route dialog -->
    <q-dialog v-model="reassignOpen">
      <q-card style="min-width: 340px">
        <q-card-section>
          <div class="text-subtitle1">Reasignar ruta</div>
          <div class="text-caption text-grey-7">
            Mover "{{ selectedExercise?.name }}" a otra ruta del árbol.
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-select
            v-model="reassignTarget"
            :options="routeOptions"
            label="Ruta destino"
            outlined
            dense
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" no-caps @click="reassignOpen = false" />
          <q-btn
            color="primary"
            label="Mover"
            no-caps
            :disable="!reassignTarget"
            @click="confirmReassign"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style lang="scss" scoped>
.tree-map-page {
  overflow: hidden;
}

.tree-map-toolbar {
  flex-shrink: 0;
  border-bottom: 1px solid $grey-4;
  background: #fff;

  &__search {
    width: 260px;
  }
}

.tree-map-canvas {
  // Height is set inline at runtime (recomputeCanvasHeight).
  position: relative;
}

.tree-map-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 280px;
  z-index: 10;
  background: #fff;
}

.tree-map-review {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: 420px;
  z-index: 10;
  background: #fff;
  display: flex;
  flex-direction: column;

  &__list {
    flex: 1;
    overflow-y: auto;
  }
}
</style>
