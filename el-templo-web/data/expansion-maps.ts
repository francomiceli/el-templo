/**
 * Expansion map configuration — GPS coordinates for all sedes
 * and Leaflet map configs for the FranExpansion 3-column layout.
 *
 * Coordinates geocoded via Nominatim (OpenStreetMap).
 * Country silhouettes are JPG outlines in public/images/.
 */

export interface SedePin {
  name: string;
  lat: number;
  lng: number;
}

export interface CityMapConfig {
  city: string;
  center: [number, number];
  zoom: number;
  pins: SedePin[];
}

// --- Mar del Plata (7 sedes) ---
export const mdpMapConfig: CityMapConfig = {
  city: "Mar del Plata",
  center: [-38.02, -57.56],
  zoom: 10,
  pins: [
    { name: "Constitución", lat: -37.9566, lng: -57.571 },
    { name: "Jujuy", lat: -38.0117, lng: -57.5684 },
    { name: "Moreno", lat: -37.9958, lng: -57.5605 },
    { name: "Alem", lat: -38.0296, lng: -57.5374 },
    { name: "Mogotes", lat: -38.0797, lng: -57.5468 },
    { name: "Park", lat: -38.0287, lng: -57.5424 },
    { name: "Chapadmalal", lat: -38.049, lng: -57.5938 },
  ],
};

// --- Barcelona (1 sede) ---
export const bcnMapConfig: CityMapConfig = {
  city: "Barcelona",
  center: [41.3996, 2.1709],
  zoom: 11,
  pins: [{ name: "Diagonal", lat: 41.3996, lng: 2.1709 }],
};

// --- Country silhouette images ---
// Transparent PNGs with white outlines in public/images/.
// Dot positions are percentages (top/left) for the terracotta city marker,
// relative to the image bounding box. Adjust these in the browser to fine-tune.

export const argSilhouette = {
  src: "/images/silhouette-argentina.png",
  /** Mar del Plata — east coast, ~75% down */
  dotTop: "50%",
  dotLeft: "65%",
};

export const spaSilhouette = {
  src: "/images/silhouette-spain.png",
  /** Barcelona — northeast coast, ~28% down */
  dotTop: "40%",
  dotLeft: "90%",
};
