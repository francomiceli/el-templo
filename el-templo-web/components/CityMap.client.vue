<script setup lang="ts">
/**
 * CityMap — Client-only Leaflet map for expansion section.
 *
 * Renders a display-only tiled map with CartoDB Dark Matter tiles
 * and Terracotta-colored pins for each sede. All interactions disabled.
 * `.client.vue` suffix ensures no SSR rendering.
 */

import L from "leaflet";
import type { CityMapConfig } from "~/data/expansion-maps";

const props = defineProps<{
  config: CityMapConfig;
  revealed?: boolean;
}>();

const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;

function initMap() {
  if (!mapContainer.value || map) return;

  map = L.map(mapContainer.value, {
    center: props.config.center,
    zoom: props.config.zoom,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    {
      subdomains: "abcd",
      maxZoom: 19,
    },
  ).addTo(map);

  // Add pins
  for (const pin of props.config.pins) {
    const icon = L.divIcon({
      className: "city-map__pin",
      html: '<span class="city-map__pin-dot"></span><span class="city-map__pin-pulse"></span>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    L.marker([pin.lat, pin.lng], { icon, interactive: false }).addTo(map);
  }
}

// Re-validate size when revealed (container may have been hidden)
watch(
  () => props.revealed,
  (val) => {
    if (val && map) {
      nextTick(() => map?.invalidateSize());
    }
  },
);

onMounted(() => {
  initMap();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <div ref="mapContainer" class="city-map" />
</template>

<style>
/* Unscoped — Leaflet injects its own DOM outside Vue's scope
   Leaflet CSS loaded globally via nuxt.config.ts */

/* Map container */
.city-map {
  width: 100%;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
}

/* Lighten CartoDB dark tiles for better contrast */
.city-map .leaflet-tile-pane {
  filter: brightness(1.4) contrast(0.9);
}

/* Pin dot (Terracotta) */
.city-map__pin {
  background: none !important;
  border: none !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.city-map__pin-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-terracotta);
}

/* Pulse ring */
.city-map__pin-pulse {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--color-terracotta);
  opacity: 0;
  animation: city-map-pulse 2s ease-out infinite;
}

@keyframes city-map-pulse {
  0% {
    width: 10px;
    height: 10px;
    opacity: 0.6;
  }
  100% {
    width: 30px;
    height: 30px;
    opacity: 0;
  }
}

/* Hide Leaflet's default attribution styling */
.city-map .leaflet-control-attribution {
  display: none;
}
</style>
