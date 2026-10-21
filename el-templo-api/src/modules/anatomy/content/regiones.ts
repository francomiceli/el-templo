import type { RegionDef } from "../types";

/**
 * Fase 200 D4: zonas como datos. Las 16 regiones del dibujo (anatomia.json).
 * `tibialis` existe en el dibujo y no viaja a la TV en v1 (flag enTv apagado).
 *
 * Orden: las 15 de la TV (`ZONAS_TV` de anatomy/projection.ts) y `tibialis` al final.
 * Las vistas están verificadas contra anatomia.json.
 */
export const REGIONES = [
  {
    slug: "chest",
    nombre: "Pecho",
    vista: "front",
    grupo: "pecho",
    enTv: true,
  },
  {
    slug: "deltoids",
    nombre: "Hombros",
    vista: "both",
    grupo: "hombros",
    enTv: true,
  },
  {
    slug: "triceps",
    nombre: "Tríceps",
    vista: "both",
    grupo: "brazos",
    enTv: true,
  },
  {
    slug: "biceps",
    nombre: "Bíceps",
    vista: "front",
    grupo: "brazos",
    enTv: true,
  },
  {
    slug: "forearm",
    nombre: "Antebrazo",
    vista: "both",
    grupo: "brazos",
    enTv: true,
  },
  {
    slug: "trapezius",
    nombre: "Trapecio",
    vista: "both",
    grupo: "espalda",
    enTv: true,
  },
  {
    slug: "upper-back",
    nombre: "Espalda alta",
    vista: "back",
    grupo: "espalda",
    enTv: true,
  },
  {
    slug: "lower-back",
    nombre: "Zona lumbar",
    vista: "back",
    grupo: "espalda",
    enTv: true,
  },
  {
    slug: "abs",
    nombre: "Abdomen",
    vista: "front",
    grupo: "core",
    enTv: true,
  },
  {
    slug: "obliques",
    nombre: "Oblicuos",
    vista: "front",
    grupo: "core",
    enTv: true,
  },
  {
    slug: "gluteal",
    nombre: "Glúteos",
    vista: "back",
    grupo: "piernas",
    enTv: true,
  },
  {
    slug: "quadriceps",
    nombre: "Cuádriceps",
    vista: "front",
    grupo: "piernas",
    enTv: true,
  },
  {
    slug: "hamstring",
    nombre: "Isquiotibiales",
    vista: "back",
    grupo: "piernas",
    enTv: true,
  },
  {
    slug: "adductors",
    nombre: "Aductores",
    vista: "both",
    grupo: "piernas",
    enTv: true,
  },
  {
    slug: "calves",
    nombre: "Pantorrillas",
    vista: "both",
    grupo: "piernas",
    enTv: true,
  },
  {
    slug: "tibialis",
    nombre: "Tibial anterior",
    vista: "front",
    grupo: "piernas",
    enTv: false,
  },
] as const satisfies readonly RegionDef[];

/** Slug de cualquier región del dibujo. */
export type ZonaSlug = (typeof REGIONES)[number]["slug"];

/** Slug de las regiones que viajan a la TV (las 15 del poll). */
export type TvZonaSlug = Extract<
  (typeof REGIONES)[number],
  { enTv: true }
>["slug"];
