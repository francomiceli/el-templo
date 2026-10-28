// Normaliza un `d` de SVG a segmentos absolutos (M / C / Z) y lo deforma con f(x, y).
// Arcos y cuadráticas se pasan a cúbicas; así una deformación suave no rompe la forma.

function tokenize(d) {
  const out = [];
  let i = 0;
  const n = d.length;
  let cmd = null;
  let argIdx = 0;
  const isNumStart = (c) => /[0-9.+-]/.test(c);
  while (i < n) {
    const c = d[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      out.push(c);
      cmd = c;
      argIdx = 0;
      i++;
      continue;
    }
    if (/[\s,]/.test(c)) {
      i++;
      continue;
    }
    // Flags de arco: un solo dígito 0/1, aunque venga pegado.
    if (
      (cmd === "a" || cmd === "A") &&
      (argIdx % 7 === 3 || argIdx % 7 === 4)
    ) {
      out.push(Number(c));
      argIdx++;
      i++;
      continue;
    }
    if (isNumStart(c)) {
      let j = i;
      if (d[j] === "+" || d[j] === "-") j++;
      let dot = false;
      while (j < n && /[0-9.]/.test(d[j])) {
        if (d[j] === ".") {
          if (dot) break;
          dot = true;
        }
        j++;
      }
      if (j < n && (d[j] === "e" || d[j] === "E")) {
        j++;
        if (d[j] === "+" || d[j] === "-") j++;
        while (j < n && /[0-9]/.test(d[j])) j++;
      }
      out.push(Number(d.slice(i, j)));
      argIdx++;
      i = j;
      continue;
    }
    throw new Error(`token inesperado '${c}' en ${i}`);
  }
  return out;
}

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  // SVG spec F.6.5 / F.6.6
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const rad = (phi * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const out = [];
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  let t = t1;
  const pt = (a) => {
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  const dpt = (a) => {
    const ex = -rx * Math.sin(a);
    const ey = ry * Math.cos(a);
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  for (let s = 0; s < segs; s++) {
    const a0 = t;
    const a1 = t + step;
    const p0 = pt(a0);
    const p1 = pt(a1);
    const d0 = dpt(a0);
    const d1 = dpt(a1);
    out.push([
      p0[0] + k * d0[0],
      p0[1] + k * d0[1],
      p1[0] - k * d1[0],
      p1[1] - k * d1[1],
      p1[0],
      p1[1],
    ]);
    t = a1;
  }
  return out;
}

/** d → [{ M: [x, y] } | { C: [x1, y1, x2, y2, x, y] } | { Z: true }] absolutos. */
export function normalize(d) {
  const tk = tokenize(d);
  const segs = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC = null; // último control de cúbica (para S)
  let lastQ = null; // último control de cuadrática (para T)
  let cmd = null;
  while (i < tk.length) {
    if (typeof tk[i] === "string") {
      cmd = tk[i];
      i++;
      if (cmd === "Z" || cmd === "z") {
        segs.push({ Z: true });
        cx = sx;
        cy = sy;
        lastC = lastQ = null;
        continue;
      }
    }
    const U = cmd.toUpperCase();
    const rel = cmd !== U;
    const na = ARGS[U];
    const a = tk.slice(i, i + na);
    if (a.length < na || a.some((v) => typeof v !== "number"))
      throw new Error("args incompletos " + cmd);
    i += na;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    let nC = null;
    let nQ = null;
    switch (U) {
      case "M":
        cx = a[0] + ox;
        cy = a[1] + oy;
        sx = cx;
        sy = cy;
        segs.push({ M: [cx, cy] });
        cmd = rel ? "l" : "L"; // pares siguientes = lineto
        break;
      case "L":
      case "H":
      case "V": {
        let x = cx;
        let y = cy;
        if (U === "L") {
          x = a[0] + ox;
          y = a[1] + oy;
        } else if (U === "H") x = a[0] + ox;
        else y = a[0] + oy;
        segs.push({
          C: [
            cx + (x - cx) / 3,
            cy + (y - cy) / 3,
            cx + (2 * (x - cx)) / 3,
            cy + (2 * (y - cy)) / 3,
            x,
            y,
          ],
        });
        cx = x;
        cy = y;
        break;
      }
      case "C": {
        const c = [
          a[0] + ox,
          a[1] + oy,
          a[2] + ox,
          a[3] + oy,
          a[4] + ox,
          a[5] + oy,
        ];
        segs.push({ C: c });
        nC = [c[2], c[3]];
        cx = c[4];
        cy = c[5];
        break;
      }
      case "S": {
        const r = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy];
        const c = [r[0], r[1], a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
        segs.push({ C: c });
        nC = [c[2], c[3]];
        cx = c[4];
        cy = c[5];
        break;
      }
      case "Q":
      case "T": {
        let q;
        let x;
        let y;
        if (U === "Q") {
          q = [a[0] + ox, a[1] + oy];
          x = a[2] + ox;
          y = a[3] + oy;
        } else {
          q = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
          x = a[0] + ox;
          y = a[1] + oy;
        }
        segs.push({
          C: [
            cx + (2 / 3) * (q[0] - cx),
            cy + (2 / 3) * (q[1] - cy),
            x + (2 / 3) * (q[0] - x),
            y + (2 / 3) * (q[1] - y),
            x,
            y,
          ],
        });
        nQ = q;
        cx = x;
        cy = y;
        break;
      }
      case "A": {
        const x = a[5] + ox;
        const y = a[6] + oy;
        for (const c of arcToCubics(cx, cy, a[0], a[1], a[2], a[3], a[4], x, y))
          segs.push({ C: c });
        cx = x;
        cy = y;
        break;
      }
    }
    lastC = nC;
    lastQ = nQ;
  }
  return segs;
}

// Un decimal alcanza: la figura mide ~1240 unidades de alto.
const r2 = (v) => Math.round(v * 10) / 10;

/** Deforma segmentos con f([x, y]) → [x, y] y los vuelve a `d`. */
export function warpD(d, f) {
  let s = "";
  for (const seg of normalize(d)) {
    if (seg.Z) s += "Z";
    else if (seg.M) {
      const [x, y] = f(seg.M[0], seg.M[1]);
      s += `M${r2(x)} ${r2(y)}`;
    } else {
      const c = seg.C;
      const p = [f(c[0], c[1]), f(c[2], c[3]), f(c[4], c[5])];
      s += `C${p.map((q) => `${r2(q[0])} ${r2(q[1])}`).join(" ")}`.replace(
        / -/g,
        "-",
      );
    }
  }
  return s;
}

/** Bbox aproximada (puntos de control incluidos). */
export function bbox(d) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const seg of normalize(d)) {
    const pts = seg.M
      ? [seg.M]
      : seg.C
        ? [seg.C.slice(0, 2), seg.C.slice(2, 4), seg.C.slice(4, 6)]
        : [];
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}
