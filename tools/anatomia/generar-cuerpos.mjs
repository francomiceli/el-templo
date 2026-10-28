// Genera el anatomia.json de las figuras (app y TV) a partir del dibujo original, con cuerpos
// de proporciones más comunes (2026-10-27): hombros un poco más angostos, cintura, cadera y
// muslos más llenos. Mismos slugs y misma estructura, solo se mueven los puntos.
//
//   node tools/anatomia/generar-cuerpos.mjs
//
// Lee `anatomia-original.json` (react-native-body-highlighter v3.2.0, MIT) y escribe las dos
// copias, que tienen que quedar idénticas (lo verifica el API en content-coverage.test.ts).
// Prettier las formatea al commitear; las dos con el mismo formato.
//
// La deformación es horizontal y depende de la altura: t = 0 en los hombros y t = 1 en las
// rodillas. Hasta `W` (medio ancho, en unidades del ancho de hombros) se escala; más afuera
// (brazos, manos) solo se desplaza con el borde del torso, así los brazos no engordan.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bbox, warpD } from "./path-warp.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../..");
const ORIGEN = resolve(AQUI, "anatomia-original.json");
const DESTINOS = [
  resolve(RAIZ, "el-templo-app/src/components/anatomy/anatomia.json"),
  resolve(RAIZ, "el-templo-admin/src/tv/recorrido/anatomia.json"),
];

// Factor de ancho por altura (keyframes [t, factor]): 1 = el dibujo original.
const PARAMS = {
  hombre: [
    [-0.3, 1],
    [0, 0.94],
    [0.12, 0.965],
    [0.36, 1.094],
    [0.5, 1.088],
    [0.72, 1.062],
    [1, 1.026],
    [1.4, 1],
  ],
  mujer: [
    [-0.3, 1],
    [0, 0.961],
    [0.12, 0.988],
    [0.33, 1.078],
    [0.48, 1.078],
    [0.72, 1.062],
    [1, 1.026],
    [1.4, 1],
  ],
  W: [
    [-0.3, 0.5],
    [0, 1.05],
    [0.15, 0.75],
    [0.36, 0.72],
    [0.5, 0.78],
    [0.72, 0.78],
    [1, 0.7],
    [1.4, 0.6],
  ],
};

const LICENCIA =
  "Geometría de react-native-body-highlighter v3.2.0 (https://github.com/HichamELBSI/react-native-body-highlighter). " +
  "MIT License, Copyright (c) ELABBASSI Hicham. Proporciones modificadas por El Templo (tools/anatomia). Conservar este aviso.";

const VISTAS = [
  ["mFront", "mOutline", 0],
  ["mBack", "mOutline", 1],
  ["fFront", "fOutline", 0],
  ["fBack", "fOutline", 1],
];

// Interpolación suave (coseno) entre keyframes ordenados por t.
function curva(kf) {
  return (t) => {
    if (t <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++) {
      const [t1, v1] = kf[i];
      const [t0, v0] = kf[i - 1];
      if (t <= t1) {
        const w = (1 - Math.cos((Math.PI * (t - t0)) / (t1 - t0))) / 2;
        return v0 + (v1 - v0) * w;
      }
    }
    return kf[kf.length - 1][1];
  };
}

function bboxGrupo(an, key, slug) {
  const g = an[key].find((x) => x.slug === slug);
  if (!g) return null;
  return g.p
    .map((p) => bbox(p[0]))
    .reduce((A, B) => ({
      x0: Math.min(A.x0, B.x0),
      y0: Math.min(A.y0, B.y0),
      x1: Math.max(A.x1, B.x1),
      y1: Math.max(A.y1, B.y1),
    }));
}

const r2 = (v) => Math.round(v * 100) / 100;

function deformar(an) {
  const out = JSON.parse(JSON.stringify(an));
  out._licencia = LICENCIA;
  for (const [key, olKey, oi] of VISTAS) {
    const ol = an[olKey][oi];
    const ob = bbox(ol);
    const cx = (ob.x0 + ob.x1) / 2;
    // Referencias de altura: hombros (deltoides) y rodillas (de espalda, el final de los isquios).
    const del = bboxGrupo(an, key, "deltoids");
    const rod = bboxGrupo(an, key, "knees") ?? bboxGrupo(an, key, "hamstring");
    if (!del || !rod)
      throw new Error(`${key}: faltan deltoids o knees/hamstring`);
    const yS = (del.y0 + del.y1) / 2;
    const yK = key.endsWith("Front") ? (rod.y0 + rod.y1) / 2 : rod.y1;
    const medioHombro = (del.x1 - del.x0) / 2;
    const s = curva(key.startsWith("f") ? PARAMS.mujer : PARAMS.hombre);
    const W = curva(PARAMS.W);
    const f = (x, y) => {
      const t = (y - yS) / (yK - yS);
      const k = s(t);
      const w = W(t) * medioHombro;
      const dx = x - cx;
      const a = Math.abs(dx);
      const nd = a <= w ? a * k : w * k + (a - w);
      return [cx + Math.sign(dx) * nd, y];
    };
    for (const g of out[key]) {
      // [d, anguloEje, elongacion, cx, cy]: el centro se mueve con el mismo campo.
      g.p = g.p.map((p) => {
        const [x, y] = f(p[3], p[4]);
        return [warpD(p[0], f), p[1], p[2], r2(x), r2(y)];
      });
    }
    out[olKey][oi] = warpD(ol, f);
  }
  return out;
}

const original = JSON.parse(readFileSync(ORIGEN, "utf8"));
const texto = JSON.stringify(deformar(original));
for (const d of DESTINOS) writeFileSync(d, texto);
console.log(
  `anatomia.json generado (${Math.round(texto.length / 1024)} KB) en:\n  ${DESTINOS.join("\n  ")}`,
);
