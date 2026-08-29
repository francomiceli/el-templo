<script setup lang="ts">
/**
 * CityMap — Client-only Leaflet map for expansion section.
 *
 * Renders a display-only tiled map with OpenStreetMap tiles darkened via a
 * CSS invert filter (charcoal look) and Terracotta-colored pins for each
 * sede. All interactions disabled. `.client.vue` suffix ensures no SSR.
 *
 * NOTE: switched off CARTO basemaps — their free tiles now return an
 * "API KEY REQUIRED" watermark. OSM needs no key. Attribution is kept
 * (required by the OSM tile usage policy) but styled subtly.
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
    attributionControl: true,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);

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

/* Darken OSM (light) tiles into a charcoal basemap.
   Only the tile pane is filtered, so the terracotta pins keep their color. */
.city-map .leaflet-tile-pane {
  filter: invert(0.94) hue-rotate(185deg) brightness(0.86) contrast(0.92)
    grayscale(0.32) sepia(0.18);
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

/* OSM requires attribution — keep it, but subtle so it doesn't fight the design */
.city-map .leaflet-control-attribution {
  background: rgba(26, 23, 20, 0.55);
  color: rgba(242, 237, 229, 0.6);
  font-size: 9px;
  padding: 1px 5px;
}
.city-map .leaflet-control-attribution a {
  color: rgba(242, 237, 229, 0.75);
}
</style>
