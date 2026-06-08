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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
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
import type {
  EditableTree,
  Effort,
  AcceptMilestoneBody,
  MilestoneVariant,
} from 'src/types/tree-editor';
import { subGroupDisplayName } from 'src/types/tree-editor';
import type { Proposal, RouteProgressionMap, AcceptOverrides } from 'src/types/proposal';
import RouteFlowNode from 'components/treemap/RouteFlowNode.vue';
import type { RouteNodeData } from 'components/treemap/RouteFlowNode.vue';
import ExerciseFlowNode from 'components/treemap/ExerciseFlowNode.vue';
import type { ExerciseNodeData } from 'components/treemap/ExerciseFlowNode.vue';
import VariantFlowNode from 'components/treemap/VariantFlowNode.vue';
import type { VariantNodeData } from 'components/treemap/VariantFlowNode.vue';
import CategoryFlowNode from 'components/treemap/CategoryFlowNode.vue';
import type { CategoryNodeData } from 'components/treemap/CategoryFlowNode.vue';
import SubgroupFlowNode from 'components/treemap/SubgroupFlowNode.vue';
import type { SubgroupNodeData } from 'components/treemap/SubgroupFlowNode.vue';
import MilestoneReviewList from 'components/treemap/MilestoneReviewList.vue';
import type {
  EditableMilestoneRow,
  MergedReviewRow,
  HitoCandidate,
} from 'components/treemap/MilestoneReviewList.vue';
import { DL_BANDS, dlBand, bandTextClass, type DlBand } from 'src/constants/levels';

type FlowNodeData =
  | RouteNodeData
  | ExerciseNodeData
  | CategoryNodeData
  | SubgroupNodeData
  | VariantNodeData;
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
  subgroupGap: 26, // y offset of the sub-grupo label above its first route node (R3)
  variantIndent: 28, // extra x offset of variant sub-nodes relative to their hito
  variantTopGap: 12, // gap between a hito and its first variant row when expanded
  variantY: 58, // vertical distance between stacked variant rows
} as const;

const AUTO_COLOR = '#9e9e9e';
const MANUAL_COLOR = '#96593a'; // $primary (terracotta)
// R4 cross-route prerequisites (UI-SPEC Capa semántica 2 — LOCKED): grey-8 dashed
// '8 4' + ArrowClosed, NOT animated. Distinct from the '6 4' #bdbdbd start-of-chain
// dash and from the animated terracotta manual precedences.
const XRUTA_COLOR = '#757575'; // grey-8
const XRUTA_EDGE_STYLE = {
  stroke: XRUTA_COLOR,
  strokeDasharray: '8 4',
  strokeWidth: 2,
} as const;

const $q = useQuasar();
const treeApi = useTreeEditorApi();
const proposalsApi = useProposalsApi();
const { setCenter } = useVueFlow();

const tree = ref<EditableTree | null>(null);
const selectedEffort = ref<Effort>('CON');
const expandedRoutes = ref<Set<string>>(new Set());
// Hito expansion state lives HERE, not in ExerciseFlowNode (D-10). Starts EMPTY =
// every hito collapsed by default; mirrors expandedRoutes exactly.
const expandedMilestones = ref<Set<number>>(new Set());
const selectedExercise = ref<ExerciseNodeData | null>(null);
const nodes = ref<FlowNode[]>([]);
const edges = ref<Edge[]>([]);

// Reassign-route dialog state
const reassignOpen = ref(false);
const reassignTarget = ref<{ label: string; value: string } | null>(null);

// Search state
const searchFilter = ref('');

// ── Sub-grupo filter (R3 — visual grouper + filter, NOT a navigation axis) ───
/** UPPERCASE DB value of the selected sub-grupo, or null = show everything. */
const subGroupFilter = ref<string | null>(null);

/** Filter options derived from the payload (display name label, UPPERCASE value). */
const subGroupOptions = computed<{ label: string; value: string }[]>(() => {
  const t = tree.value;
  if (!t) return [];
  const present = new Set<string>();
  for (const cat of t.categories) {
    for (const rt of cat.routes) {
      if (rt.subGroup !== '') present.add(rt.subGroup);
    }
  }
  return [...present]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((sg) => ({ label: subGroupDisplayName(sg), value: sg }));
});

/** Active filter matches no route at all → canvas empty state (LOCKED copy). */
const subGroupFilterEmpty = computed<boolean>(() => {
  const t = tree.value;
  const filter = subGroupFilter.value;
  if (!t || !filter) return false;
  return !t.categories.some((c) => c.routes.some((r) => r.subGroup === filter));
});

function onSubGroupFilterChange(): void {
  selectedExercise.value = null;
  rebuildGraph();
}

// ── Proposal review state (Revisión de dimensiones absorbed into the map) ─────
const proposals = ref<Proposal[]>([]);
const routeMap = ref<RouteProgressionMap>({});
/** routes.code whose pending proposals are open in the review drawer (null = closed). */
const reviewRoute = ref<string | null>(null);
/** exerciseId of the row with a mutation in flight (per-row loading state). */
const proposalBusyId = ref<number | null>(null);
const bulkBusy = ref(false);
/** Pending hito/variante proposals of the open route (plan 05), with editable state. */
const milestoneRows = ref<EditableMilestoneRow[]>([]);

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadTree(): Promise<void> {
  try {
    tree.value = await treeApi.fetchTree();
    // Drop expanded/selected state that no longer exists after a refetch.
    const routeCodes = new Set(tree.value.categories.flatMap((c) => c.routes.map((r) => r.route)));
    expandedRoutes.value = new Set([...expandedRoutes.value].filter((r) => routeCodes.has(r)));
    // Keep only hitos that still carry variantes (mirror of the route cleanup above).
    const variantBearing = new Set<number>();
    for (const cat of tree.value.categories) {
      for (const rt of cat.routes) {
        for (const part of rt.partitions) {
          for (const ex of part.nodes) {
            if (ex.variants.length > 0) variantBearing.add(ex.exerciseId);
          }
        }
      }
    }
    expandedMilestones.value = new Set(
      [...expandedMilestones.value].filter((id) => variantBearing.has(id))
    );
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

/** exerciseId → routes.code across the whole tree (R4 cross-route classification). */
const exerciseRouteMap = computed<Map<number, string>>(() => {
  const map = new Map<number, string>();
  const t = tree.value;
  if (!t) return map;
  for (const cat of t.categories) {
    for (const rt of cat.routes) {
      for (const part of rt.partitions) {
        for (const ex of part.nodes) map.set(ex.exerciseId, rt.route);
      }
    }
  }
  return map;
});

/** True when a precedence edge crosses routes (R4) — same-route edges keep their render. */
function isCrossRouteEdge(fromExerciseId: number, toExerciseId: number): boolean {
  const fromRoute = exerciseRouteMap.value.get(fromExerciseId);
  const toRoute = exerciseRouteMap.value.get(toExerciseId);
  return fromRoute !== undefined && toRoute !== undefined && fromRoute !== toRoute;
}

function rebuildGraph(): void {
  const t = tree.value;
  if (!t) {
    nodes.value = [];
    edges.value = [];
    return;
  }

  const ns: FlowNode[] = [];
  const es: Edge[] = [];

  // R4: routes with INCOMING cross-route prerequisites (élite routes — badge prereq).
  const prereqTargets = new Set<string>();
  for (const pe of t.precedenceEdges) {
    if (isCrossRouteEdge(pe.fromExerciseId, pe.toExerciseId)) {
      const toRoute = exerciseRouteMap.value.get(pe.toExerciseId);
      if (toRoute !== undefined) prereqTargets.add(toRoute);
    }
  }

  let bandY = 0;
  for (const cat of t.categories) {
    // R3: filter by sub-grupo (hide routes of other sub-grupos), then order the
    // band's columns by sub-grupo (alphabetical, code-point — UPPERCASE ASCII).
    // Array.prototype.sort is stable: routes keep their payload order inside a group.
    const bandRoutes = cat.routes
      .filter((rt) => !subGroupFilter.value || rt.subGroup === subGroupFilter.value)
      .slice()
      .sort((a, b) => (a.subGroup < b.subGroup ? -1 : a.subGroup > b.subGroup ? 1 : 0));
    if (bandRoutes.length === 0) continue; // band fully filtered out — skip its header too

    ns.push({
      id: `cat-${cat.key}`,
      type: 'category',
      position: { x: 0, y: bandY },
      data: { label: cat.label },
      draggable: false,
      selectable: false,
      focusable: false,
    });

    // The band must clear its tallest expanded chain (in px) before the next one
    // starts — measured as an extent so expanded variant rows are accounted for.
    let maxChainExtent = 0;
    let prevSubGroup: string | null = null;

    bandRoutes.forEach((rt, routeIndex) => {
      const part = rt.partitions.find((p) => p.effort === selectedEffort.value);
      const chain = part?.nodes ?? [];
      const isExpanded = expandedRoutes.value.has(rt.route) && chain.length > 0;
      const routeX = routeIndex * LAYOUT.routeColW;
      const routeY = bandY + LAYOUT.catH;

      // R3: sub-grupo label above the FIRST column of each group (visual grouper).
      if (rt.subGroup !== '' && rt.subGroup !== prevSubGroup) {
        ns.push({
          id: `subgroup-${cat.key}-${rt.subGroup}`,
          type: 'subgroup',
          position: { x: routeX, y: routeY - LAYOUT.subgroupGap },
          data: { label: subGroupDisplayName(rt.subGroup) },
          draggable: false,
          selectable: false,
          focusable: false,
        });
      }
      prevSubGroup = rt.subGroup;

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
          hasPrereq: prereqTargets.has(rt.route),
        },
        draggable: false,
      });

      if (isExpanded) {
        const chainY0 = routeY + LAYOUT.routeH + LAYOUT.chainTopGap;
        const manual = part?.overridden ?? false;
        let prevId: string | null = null;
        // Bottom-most y reached by this chain, including any expanded variant rows,
        // so the band height clears everything (no overlap with the next band).
        let chainBottomY = chainY0;
        chain.forEach((ex, i) => {
          const id = `ex-${ex.exerciseId}`;
          const variants = ex.variants ?? [];
          const variantsExpanded = expandedMilestones.value.has(ex.exerciseId);
          const hitoY = chainY0 + i * LAYOUT.stepY;
          ns.push({
            id,
            type: 'exercise',
            position: { x: routeX + LAYOUT.chainIndent, y: hitoY },
            data: {
              exerciseId: ex.exerciseId,
              name: ex.name,
              dl: ex.dificultadLineal,
              orderSource: ex.orderSource,
              route: rt.route,
              effort: selectedEffort.value,
              stepIndex: i,
              variants,
              variantsExpanded,
            },
          });
          chainBottomY = Math.max(chainBottomY, hitoY);
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

          // Expanded hito → render its variantes hanging below (dl asc, banded).
          // Distinct dashed grey edge (XRUTA style), NOT the backbone chain stroke.
          if (variantsExpanded && variants.length > 0) {
            const variantX = routeX + LAYOUT.chainIndent + LAYOUT.variantIndent;
            variants.forEach((variant, vi) => {
              const variantNodeId = `var-${variant.id}`;
              const variantY = hitoY + LAYOUT.variantTopGap + (vi + 1) * LAYOUT.variantY;
              ns.push({
                id: variantNodeId,
                type: 'variant',
                position: { x: variantX, y: variantY },
                data: { variantId: variant.id, name: variant.name, dl: variant.dl },
                draggable: false,
                selectable: false,
                focusable: false,
              });
              es.push({
                id: `variant-${id}-${variantNodeId}`,
                source: id,
                target: variantNodeId,
                animated: false,
                style: { ...XRUTA_EDGE_STYLE },
              });
              chainBottomY = Math.max(chainBottomY, variantY);
            });
          }
        });

        // Extent (px) from the band's chain start down to its lowest node.
        maxChainExtent = Math.max(maxChainExtent, chainBottomY - chainY0 + LAYOUT.stepY);
      }
    });

    bandY +=
      LAYOUT.catH +
      LAYOUT.routeH +
      (maxChainExtent > 0 ? LAYOUT.chainTopGap + maxChainExtent : 0) +
      LAYOUT.bandGap;
  }

  // Precedence edges. Same-route (cross-effort-partition) edges keep the existing
  // render and the both-endpoints-visible gate. Cross-route (R4) edges render grey
  // dashed node→node when both endpoints are expanded, and AGGREGATE to a single
  // route→route edge per route pair when an endpoint is collapsed (Pitfall 7 —
  // a prerequisite must never be invisible).
  const visibleExercises = new Set(ns.filter((n) => n.type === 'exercise').map((n) => n.id));
  const visibleRouteNodes = new Set(ns.filter((n) => n.type === 'route').map((n) => n.id));
  const aggregated = new Map<
    string,
    { fromRoute: string; toRoute: string; pairs: { from: number; to: number }[] }
  >();

  for (const pe of t.precedenceEdges) {
    const source = `ex-${pe.fromExerciseId}`;
    const target = `ex-${pe.toExerciseId}`;
    const bothVisible = visibleExercises.has(source) && visibleExercises.has(target);
    const crossRoute = isCrossRouteEdge(pe.fromExerciseId, pe.toExerciseId);

    if (bothVisible) {
      es.push({
        id: `prec-${pe.fromExerciseId}-${pe.toExerciseId}`,
        source,
        target,
        // R4 LOCKED style; same-route manual precedences keep terracotta animated.
        animated: !crossRoute,
        style: crossRoute
          ? { ...XRUTA_EDGE_STYLE }
          : { stroke: pe.source === 'manual' ? MANUAL_COLOR : AUTO_COLOR, strokeWidth: 2 },
        markerEnd: MarkerType.ArrowClosed,
        data: {
          precedence: true,
          crossRoute,
          edgeSource: pe.source,
          from: pe.fromExerciseId,
          to: pe.toExerciseId,
        },
      });
    } else if (crossRoute) {
      const fromRoute = exerciseRouteMap.value.get(pe.fromExerciseId);
      const toRoute = exerciseRouteMap.value.get(pe.toExerciseId);
      if (
        fromRoute !== undefined &&
        toRoute !== undefined &&
        visibleRouteNodes.has(`route-${fromRoute}`) &&
        visibleRouteNodes.has(`route-${toRoute}`)
      ) {
        const key = `${fromRoute}→${toRoute}`;
        const bucket = aggregated.get(key);
        const pair = { from: pe.fromExerciseId, to: pe.toExerciseId };
        if (bucket) bucket.pairs.push(pair);
        else aggregated.set(key, { fromRoute, toRoute, pairs: [pair] });
      }
    }
  }

  // ONE aggregated edge per route pair (deduplicated), same R4 style.
  for (const agg of aggregated.values()) {
    es.push({
      id: `prereq-agg-${agg.fromRoute}-${agg.toRoute}`,
      source: `route-${agg.fromRoute}`,
      target: `route-${agg.toRoute}`,
      animated: false,
      style: { ...XRUTA_EDGE_STYLE },
      markerEnd: MarkerType.ArrowClosed,
      data: { crossRouteAgg: true, pairs: agg.pairs },
    });
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

/** Toggle a hito's variantes open/closed (page-owned state, D-10). */
function toggleMilestone(exerciseId: number): void {
  const next = new Set(expandedMilestones.value);
  if (next.has(exerciseId)) next.delete(exerciseId);
  else next.add(exerciseId);
  expandedMilestones.value = next;
  rebuildGraph();
}

function collapseAll(): void {
  expandedRoutes.value = new Set();
  expandedMilestones.value = new Set();
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

/** LOCKED R4 copy: `Prerequisito: {ejercicio origen} ({ruta}) → {ejercicio destino} ({ruta})`. */
function prereqEdgeCopy(fromExerciseId: number, toExerciseId: number): string {
  const fromName = exerciseLookup.value.get(fromExerciseId)?.name ?? `#${fromExerciseId}`;
  const toName = exerciseLookup.value.get(toExerciseId)?.name ?? `#${toExerciseId}`;
  const fromRoute = exerciseRouteMap.value.get(fromExerciseId) ?? '—';
  const toRoute = exerciseRouteMap.value.get(toExerciseId) ?? '—';
  return `Prerequisito: ${fromName} (${fromRoute}) → ${toName} (${toRoute})`;
}

/**
 * Edge click. R4 cross-route edges show the LOCKED prerequisite copy (the
 * aggregated route→route edge lists every pair it summarizes); manual edges
 * keep the existing removal flow (baja via /precedence — no new UI).
 */
function onEdgeClick(event: EdgeMouseEvent): void {
  const data = event.edge.data as
    | {
        precedence?: boolean;
        crossRoute?: boolean;
        crossRouteAgg?: boolean;
        pairs?: { from: number; to: number }[];
        edgeSource?: string;
        from?: number;
        to?: number;
      }
    | undefined;

  // Aggregated R4 edge (collapsed endpoints): list the pairs it summarizes.
  if (data?.crossRouteAgg && data.pairs) {
    $q.dialog({
      title: 'Prerequisitos entre rutas',
      message: data.pairs.map((p) => prereqEdgeCopy(p.from, p.to)).join(' · '),
      ok: { label: 'Cerrar', flat: true },
    });
    return;
  }

  if (!data?.precedence || typeof data.from !== 'number' || typeof data.to !== 'number') return;
  const from = data.from;
  const to = data.to;

  if (data.edgeSource !== 'manual') {
    $q.notify({
      type: 'info',
      message: data.crossRoute
        ? prereqEdgeCopy(from, to)
        : 'Esta precedencia es automática (no se borra desde acá)',
    });
    return;
  }
  $q.dialog({
    title: 'Eliminar precedencia manual',
    message: data.crossRoute
      ? `${prereqEdgeCopy(from, to)}. ¿Eliminar esta precedencia?`
      : '¿Eliminar esta precedencia entre ramas?',
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

// ── Proposal review drawer (Revisión de dimensiones + hito/variante) ─────────

/**
 * Drawer rows: pending dimension proposals MERGED with the pending hito/variante
 * proposals of the route, keyed by exerciseId (UI-SPEC C4 — one pass per row).
 * The wrappers are rebuilt on recompute but point at the stable underlying
 * objects, so in-place edits (selects/toggle) survive.
 */
const mergedReviewRows = computed<MergedReviewRow[]>(() => {
  if (!reviewRoute.value) return [];
  const dimensionRows = pendingByRoute.value.get(reviewRoute.value.trim().toUpperCase()) ?? [];
  const byExercise = new Map<number, MergedReviewRow>();
  for (const p of dimensionRows) {
    byExercise.set(p.exerciseId, {
      exerciseId: p.exerciseId,
      name: p.exerciseName,
      proposal: p,
      milestone: null,
    });
  }
  for (const m of milestoneRows.value) {
    const existing = byExercise.get(m.exerciseId);
    if (existing) existing.milestone = m;
    else
      byExercise.set(m.exerciseId, {
        exerciseId: m.exerciseId,
        name: m.name,
        proposal: null,
        milestone: m,
      });
  }
  return [...byExercise.values()];
});

const reviewRouteName = computed(() => {
  const t = tree.value;
  if (!t || !reviewRoute.value) return reviewRoute.value ?? '';
  const rt = t.categories.flatMap((c) => c.routes).find((r) => r.route === reviewRoute.value);
  return rt?.name ?? reviewRoute.value;
});

/** Fetch the route's pending hito/variante proposals and seed their editable state. */
async function loadMilestoneReview(code: string): Promise<void> {
  try {
    const rows = await treeApi.getMilestoneReview(code);
    milestoneRows.value = rows.map((r) => ({
      ...r,
      role: r.proposedMilestoneExerciseId === null ? 'hito' : 'variante',
      targetId: r.proposedMilestoneExerciseId,
    }));
  } catch {
    // composable already notified; keep the previous rows.
  }
}

function openReview(code: string): void {
  selectedExercise.value = null;
  reviewRoute.value = code;
  milestoneRows.value = [];
  void loadMilestoneReview(code);
  // Expand the route so accepted exercises appear in the chain right away.
  if (!expandedRoutes.value.has(code)) {
    expandedRoutes.value = new Set([...expandedRoutes.value, code]);
    rebuildGraph();
  }
}

function closeReview(): void {
  reviewRoute.value = null;
  milestoneRows.value = [];
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

/** Refetch everything the review mutations may have changed (no optimistic updates). */
async function refreshReviewData(): Promise<void> {
  const tasks: Promise<void>[] = [loadProposals(), loadTree()];
  if (reviewRoute.value) tasks.push(loadMilestoneReview(reviewRoute.value));
  await Promise.all(tasks);
}

async function acceptOne(p: Proposal): Promise<void> {
  proposalBusyId.value = p.exerciseId;
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
  proposalBusyId.value = p.exerciseId;
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

// ── Hito/variante review flows (R1-REV, locked decision 2: one pass) ─────────

/** exerciseId → {name, dl} across the whole tree (variant targets, candidate labels). */
const exerciseLookup = computed<Map<number, { name: string; dl: number | null }>>(() => {
  const map = new Map<number, { name: string; dl: number | null }>();
  const t = tree.value;
  if (!t) return map;
  for (const cat of t.categories) {
    for (const rt of cat.routes) {
      for (const part of rt.partitions) {
        for (const ex of part.nodes) {
          map.set(ex.exerciseId, { name: ex.name, dl: ex.dificultadLineal });
        }
      }
    }
  }
  return map;
});

/** Display name of a candidate hito (review rows first, then the tree, then the id). */
function hitoNameOf(exerciseId: number): string {
  const inRows = milestoneRows.value.find((r) => r.exerciseId === exerciseId);
  if (inRows) return inRows.name;
  return exerciseLookup.value.get(exerciseId)?.name ?? `#${exerciseId}`;
}

/** Candidates of the SAME group (movementToken × stepRank), `nombre — dl N` (UI-SPEC C4). */
function hitoCandidatesFor(row: MergedReviewRow): HitoCandidate[] {
  const m = row.milestone;
  if (!m) return [];
  const options: HitoCandidate[] = milestoneRows.value
    .filter(
      (r) =>
        r.exerciseId !== m.exerciseId &&
        r.movementToken === m.movementToken &&
        r.stepRank === m.stepRank
    )
    .map((r) => ({ label: `${r.name} — dl ${r.dl}`, value: r.exerciseId }));
  // Keep the heuristic's proposed hito selectable even if it left the pending list.
  const proposed = m.proposedMilestoneExerciseId;
  if (proposed !== null && !options.some((o) => o.value === proposed)) {
    const info = exerciseLookup.value.get(proposed);
    options.unshift({
      label: info ? `${info.name} — dl ${info.dl ?? '—'}` : `#${proposed}`,
      value: proposed,
    });
  }
  return options;
}

/** True when the exercise lives in a partition with a manual (locked) chain. */
function isInLockedPartition(exerciseId: number): boolean {
  const t = tree.value;
  if (!t) return false;
  for (const cat of t.categories) {
    for (const rt of cat.routes) {
      for (const part of rt.partitions) {
        if (part.overridden && part.nodes.some((n) => n.exerciseId === exerciseId)) return true;
      }
    }
  }
  return false;
}

/** ONE-tx accept of both axes (dimension overrides ride the same transaction). */
async function acceptMilestoneRow(row: MergedReviewRow): Promise<void> {
  const m = row.milestone;
  if (!m) return;
  proposalBusyId.value = row.exerciseId;
  try {
    const body: AcceptMilestoneBody = { exerciseId: row.exerciseId, role: m.role };
    if (m.role === 'variante' && m.targetId !== null) body.milestoneExerciseId = m.targetId;
    if (row.proposal) {
      body.dimensionOverrides = {
        step: row.proposal.proposedStep,
        habilidad: row.proposal.proposedHabilidad,
      };
    }
    await treeApi.acceptMilestoneReview(body);
    const outcome =
      m.role === 'hito'
        ? 'Hito'
        : `Variante de ${m.targetId !== null ? hitoNameOf(m.targetId) : '—'}`;
    $q.notify({ type: 'positive', message: `Propuesta aceptada: ${row.name} → ${outcome}.` });
    await refreshReviewData();
  } catch {
    // composable already notified; previous state intact (no optimistic updates)
  } finally {
    proposalBusyId.value = null;
  }
}

/**
 * Row accept dispatch: rows with a hito/variante proposal go through the ONE-tx
 * accept (both axes); dimension-only rows keep the existing flow unchanged.
 * Accepting a variante inside a hand-ordered (locked) chain asks for explicit
 * confirmation BEFORE the POST (UI-SPEC locked copy).
 */
function onAcceptRow(row: MergedReviewRow): void {
  const m = row.milestone;
  if (!m) {
    if (row.proposal) void acceptOne(row.proposal);
    return;
  }
  if (m.role === 'variante' && isInLockedPartition(row.exerciseId)) {
    $q.dialog({
      title: 'La cadena se va a editar',
      message: `"${row.name}" está en una cadena ordenada a mano. Al marcarlo como variante sale de la cadena y sus vecinos se reconectan.`,
      cancel: { label: 'Cancelar', flat: true },
      ok: { label: 'Aceptar igual', color: 'primary' },
    }).onOk(() => {
      void acceptMilestoneRow(row);
    });
    return;
  }
  void acceptMilestoneRow(row);
}

/** Row reject dispatch — analogous to accept (milestone axis first, else dimension). */
function onRejectRow(row: MergedReviewRow): void {
  if (row.milestone) {
    void (async () => {
      proposalBusyId.value = row.exerciseId;
      try {
        await treeApi.rejectMilestoneReview(row.exerciseId);
        $q.notify({ type: 'info', message: `"${row.name}" rechazado` });
        if (reviewRoute.value) await loadMilestoneReview(reviewRoute.value);
      } catch {
        // composable already notified
      } finally {
        proposalBusyId.value = null;
      }
    })();
    return;
  }
  if (row.proposal) void rejectOne(row.proposal);
}

// In-place edit handlers (the list component is presentational and only emits).
function onUpdateRole(row: MergedReviewRow, role: 'hito' | 'variante'): void {
  if (row.milestone) row.milestone.role = role;
}
function onUpdateTarget(row: MergedReviewRow, targetId: number | null): void {
  if (row.milestone) row.milestone.targetId = targetId;
}
function onUpdateStep(row: MergedReviewRow, step: number | null): void {
  if (row.proposal) row.proposal.proposedStep = step;
}
function onUpdateHabilidad(row: MergedReviewRow, habilidad: string | null): void {
  if (row.proposal) row.proposal.proposedHabilidad = habilidad;
}

function bulkAcceptRoute(): void {
  const rows = mergedReviewRows.value;
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
        let accepted = 0;
        // Rows with a hito/variante proposal: both axes per row, one tx each.
        for (const row of rows) {
          const m = row.milestone;
          if (!m) continue;
          if (m.role === 'variante' && m.targetId === null) continue; // sin hito elegido — queda pendiente
          const body: AcceptMilestoneBody = { exerciseId: row.exerciseId, role: m.role };
          if (m.role === 'variante' && m.targetId !== null) body.milestoneExerciseId = m.targetId;
          if (row.proposal) {
            body.dimensionOverrides = {
              step: row.proposal.proposedStep,
              habilidad: row.proposal.proposedHabilidad,
            };
          }
          await treeApi.acceptMilestoneReview(body);
          accepted += 1;
        }
        // Dimension-only rows keep the existing bulk endpoint.
        const dimensionOnlyIds = rows.flatMap((r) =>
          !r.milestone && r.proposal ? [r.proposal.id] : []
        );
        if (dimensionOnlyIds.length > 0) {
          const res = await proposalsApi.bulkAccept(dimensionOnlyIds);
          accepted += res.acceptedCount;
        }
        $q.notify({ type: 'positive', message: `${accepted} propuestas aceptadas` });
        await refreshReviewData();
      } catch {
        // composable already notified; refetch so partial progress is visible
        await refreshReviewData();
      } finally {
        bulkBusy.value = false;
      }
    })();
  });
}

// ── Side panel: hito ↔ variantes (R1-REV, UI-SPEC C5) ────────────────────────

/** Variantes of the selected hito (truth). null = not fetched yet (lazy on expand). */
const variants = ref<MilestoneVariant[] | null>(null);
const variantsLoading = ref(false);
/** Variante shown in the panel (picked from the variants list); null = hito view. */
const selectedVariant = ref<MilestoneVariant | null>(null);
/** Promote in flight — disables "Marcar como hito" / "Promover a hito" buttons. */
const promoteBusy = ref(false);

// Selecting another exercise (or clearing) drops the variant state of the panel.
watch(selectedExercise, () => {
  selectedVariant.value = null;
  variants.value = null;
});

const variantsLabel = computed(() =>
  variants.value === null ? 'Variantes' : `Variantes (${variants.value.length})`
);

/** Lazy fetch — called when the expansion opens, NOT on node selection. */
function onVariantsExpand(): void {
  if (variants.value === null && !variantsLoading.value) void loadVariants();
}

async function loadVariants(): Promise<void> {
  const sel = selectedExercise.value;
  if (!sel) return;
  variantsLoading.value = true;
  try {
    variants.value = await treeApi.getVariants(sel.exerciseId);
  } catch {
    // composable already notified; expansion keeps the unloaded state.
  } finally {
    variantsLoading.value = false;
  }
}

/** Band-colored dl badge bits for a listed variante (R2-BANDS constants). */
function variantBandColor(dl: number): string {
  return dlBand(dl)?.color ?? 'grey-6';
}
function variantBandTextClass(dl: number): string {
  const band = dlBand(dl);
  return band ? bandTextClass(band) : 'text-white';
}

/** Confirmation (LOCKED copy) before the transactional variante↔hito swap. */
function confirmPromote(variant: MilestoneVariant): void {
  const hito = selectedExercise.value;
  if (!hito || promoteBusy.value) return;
  $q.dialog({
    title: 'Promover a hito',
    message: `"${variant.name}" pasa a ser el hito y "${hito.name}" pasa a variante. Las cadenas del árbol se recalculan.`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Promover', color: 'primary' },
  }).onOk(() => {
    void promoteVariant(variant, hito.name);
  });
}

async function promoteVariant(variant: MilestoneVariant, formerHitoName: string): Promise<void> {
  promoteBusy.value = true;
  try {
    await treeApi.promoteMilestone(variant.id);
    $q.notify({
      type: 'positive',
      message: `${variant.name} ahora es el hito; ${formerHitoName} pasó a variante.`,
    });
    // Las cadenas cambiaron — selección vieja inválida, refetch del árbol completo.
    selectedVariant.value = null;
    selectedExercise.value = null;
    await loadTree();
  } catch {
    // composable already notified; previous state intact.
  } finally {
    promoteBusy.value = false;
  }
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
      // Routes hidden by the sub-grupo filter are not searchable (their nodes
      // are off the canvas — selecting them could not expand/center anything).
      if (subGroupFilter.value && rt.subGroup !== subGroupFilter.value) continue;
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
  if (node.type === 'variant') return '#ebebeb';
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

      <!-- Filtro de sub-grupo (R3 — agrupador visual + filtro, no navegación) -->
      <q-select
        v-model="subGroupFilter"
        :options="subGroupOptions"
        label="Sub-grupo"
        dense
        outlined
        clearable
        emit-value
        map-options
        options-dense
        class="tree-map-toolbar__subgroup"
        @update:model-value="onSubGroupFilterChange"
      />

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
        <template #node-subgroup="props">
          <SubgroupFlowNode :data="props.data" />
        </template>
        <template #node-route="props">
          <RouteFlowNode :data="props.data" @review="openReview(props.data.code)" />
        </template>
        <template #node-exercise="props">
          <ExerciseFlowNode
            :data="props.data"
            :selected="props.selected"
            @toggle-variants="toggleMilestone"
          />
        </template>
        <template #node-variant="props">
          <VariantFlowNode :data="props.data" />
        </template>
      </VueFlow>

      <!-- Empty state del filtro de sub-grupo (copy LOCKED) -->
      <div v-if="subGroupFilterEmpty" class="tree-map-canvas__empty text-caption text-grey-6">
        No hay rutas en este sub-grupo.
      </div>

      <!-- Review drawer: pending dimension proposals of one route -->
      <q-card v-if="reviewRoute" class="tree-map-review" flat bordered>
        <q-card-section class="q-pb-xs">
          <div class="row items-center no-wrap">
            <div class="col">
              <div class="text-subtitle2">Revisión — {{ reviewRouteName }}</div>
              <div class="text-caption text-grey-7">
                {{ mergedReviewRows.length }} propuestas pendientes
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
              :disable="mergedReviewRows.length === 0"
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
          <MilestoneReviewList
            :rows="mergedReviewRows"
            :route="reviewRoute"
            :busy-exercise-id="proposalBusyId"
            :step-options="stepOptionsFor"
            :habilidad-options="habilidadOptionsFor"
            :unmatched="isUnmatched"
            :hito-candidates="hitoCandidatesFor"
            @accept="onAcceptRow"
            @reject="onRejectRow"
            @update-role="onUpdateRole"
            @update-target="onUpdateTarget"
            @update-step="onUpdateStep"
            @update-habilidad="onUpdateHabilidad"
          />
        </q-card-section>
      </q-card>

      <!-- Side panel: selected exercise -->
      <q-card v-if="selectedExercise" class="tree-map-panel" flat bordered>
        <!-- Vista variante: entidad elegida desde la lista de variantes (UI-SPEC C5) -->
        <template v-if="selectedVariant">
          <q-card-section class="q-pb-xs">
            <div class="row items-start no-wrap">
              <div class="col">
                <div class="text-subtitle2">{{ selectedVariant.name }}</div>
                <div class="text-caption text-grey-7">
                  <q-badge
                    :color="variantBandColor(selectedVariant.dl)"
                    :class="variantBandTextClass(selectedVariant.dl)"
                    :label="`dl ${selectedVariant.dl}`"
                  />
                  <q-badge
                    color="grey-7"
                    outline
                    class="q-ml-xs cursor-pointer"
                    role="button"
                    tabindex="0"
                    @click="selectedVariant = null"
                  >
                    Variante de: {{ selectedExercise.name }}
                  </q-badge>
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
            <q-btn
              outline
              dense
              size="sm"
              label="Promover a hito"
              no-caps
              class="full-width"
              :loading="promoteBusy"
              :disable="promoteBusy"
              @click="confirmPromote(selectedVariant)"
            />
          </q-card-section>
        </template>

        <!-- Vista hito: nodo del canvas (el backbone solo contiene hitos) -->
        <template v-else>
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
                  <q-badge color="primary" outline label="Hito" class="q-ml-xs" />
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
              Tip: también podés arrastrar el ejercicio a otra posición de su escalera, o dibujar
              una flecha hacia un ejercicio de otra rama para crear una precedencia.
            </div>
          </q-card-section>
          <q-separator />
          <!-- Variantes del hito (fetch lazy al expandir — UI-SPEC C5) -->
          <q-expansion-item
            :key="selectedExercise.exerciseId"
            dense
            :label="variantsLabel"
            @show="onVariantsExpand"
          >
            <div v-if="variantsLoading" class="q-px-md q-pb-sm">
              <q-skeleton type="text" />
              <q-skeleton type="text" width="60%" />
            </div>
            <div
              v-else-if="variants !== null && variants.length === 0"
              class="q-px-md q-pb-sm text-caption text-grey-6"
            >
              Este hito no tiene variantes asignadas.
            </div>
            <q-list v-else-if="variants !== null" dense>
              <q-item
                v-for="variant in variants"
                :key="variant.id"
                dense
                clickable
                @click="selectedVariant = variant"
              >
                <q-item-section>
                  <div class="row items-center no-wrap">
                    <span class="text-body2">{{ variant.name }}</span>
                    <q-badge
                      :color="variantBandColor(variant.dl)"
                      :class="variantBandTextClass(variant.dl)"
                      :label="`dl ${variant.dl}`"
                      class="q-ml-xs"
                    />
                  </div>
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    size="sm"
                    label="Marcar como hito"
                    no-caps
                    :disable="promoteBusy"
                    @click.stop="confirmPromote(variant)"
                  />
                </q-item-section>
              </q-item>
            </q-list>
          </q-expansion-item>
        </template>
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

  &__subgroup {
    width: 180px;
  }
}

.tree-map-canvas {
  // Height is set inline at runtime (recomputeCanvasHeight).
  position: relative;

  &__empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
    pointer-events: none;
  }
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
