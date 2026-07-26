/**
 * Build de la pantalla de sede (`/tv/`).
 *
 * Produce `public/tv/` — una pagina estatica autocontenida que NO es el SPA:
 * el browser de un televisor de sede (webOS 4.x = Chromium 53) no parsea el bundle
 * de Quasar/Vue, que compila a chrome115 (D-24, Pitfall 3 del RESEARCH).
 *
 * Pasos, en orden, y falla con exit 1 ante cualquier problema para que CI lo vea:
 *   1. resolver esbuild (ya presente como dependencia transitiva de vite — no instala nada)
 *   2. typecheck es2015 del kiosco: el gate de compatibilidad
 *   3. bundle IIFE del entry src/tv/main.ts
 *   4. decodificar fuentes/marmol/logo del base64 de pdf-assets.ts (C-12: sin CDN)
 *   5. copiar los vectores dorados del timer que emite el test del API
 *   6. calcular la version del build (D-22)
 *   7. escribir index.html con el CSS y el JS INLINE
 *
 * Por que inline: el nginx del admin cachea cualquier .js/.css un año con `immutable`
 * (deploy/nginx/admin.eltemplo.org:20) y este bundle no lleva hash en el nombre. Un
 * `tv.js` externo dejaria los televisores congelados en la version vieja para siempre
 * (Pitfall 7). El .html y el .txt no matchean ese regex, asi que si se refrescan.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[build-tv]';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const srcDir = resolve(root, 'src/tv');
const outDir = resolve(root, 'public/tv');

function fail(message, detail) {
  console.error(`${TAG} ${message}`);
  if (detail) console.error(`${TAG} ${detail}`);
  process.exit(1);
}

function readRequired(path, what) {
  if (!existsSync(path)) fail(`falta ${what}: ${path}`);
  return readFileSync(path);
}

/** Escribe solo si el contenido cambio: un rebuild identico no re-rsyncea en el deploy. */
function writeIfChanged(destPath, contents, mtimeFrom) {
  if (existsSync(destPath)) {
    const current = readFileSync(destPath);
    if (current.equals(Buffer.isBuffer(contents) ? contents : Buffer.from(contents))) {
      return false;
    }
  }
  writeFileSync(destPath, contents);
  if (mtimeFrom && existsSync(mtimeFrom)) {
    // Mismo criterio que scripts/copy-ffmpeg.mjs: la mtime sigue a la del origen para
    // que rsync no vuelva a mandar ~500 KB de fuentes en cada deploy.
    const srcStat = statSync(mtimeFrom);
    utimesSync(destPath, srcStat.atime, srcStat.mtime);
  }
  return true;
}

// ── 1. esbuild ────────────────────────────────────────────────────────────────
// Ya esta en node_modules como dependencia transitiva de vite. Agregarlo como
// devDependency explicita seria instalar una dependencia = gate humano (C-08).
let esbuild;
try {
  esbuild = await import('esbuild');
} catch (err) {
  fail(
    'no se pudo resolver esbuild desde node_modules.',
    `Correr "pnpm install" primero. NO agregar esbuild como devDependency sin aprobacion humana (C-08). Detalle: ${err instanceof Error ? err.message : String(err)}`
  );
}

// ── 2. Typecheck es2015: el gate de compatibilidad del kiosco ─────────────────
const tscBin = resolve(root, 'node_modules/.bin/tsc');
if (!existsSync(tscBin)) fail(`falta ${tscBin} — correr "pnpm install"`);
try {
  execFileSync(tscBin, ['-p', 'src/tv/tsconfig.tv.json', '--noEmit'], {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  fail(
    'el typecheck es2015 del kiosco fallo (ver errores arriba).',
    'lib acotada a es2015+dom a proposito: padStart, Object.entries, Array.flat y compania NO existen en un TV de sede.'
  );
}
console.log(`${TAG} typecheck es2015 OK`);

// ── 3. Bundle del kiosco ──────────────────────────────────────────────────────
const entry = resolve(srcDir, 'main.ts');
if (!existsSync(entry)) fail(`falta el entry del kiosco: ${entry}`);

const jsResult = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  target: ['es2015'],
  minify: true,
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
if (jsResult.outputFiles.length !== 1) {
  fail(`esbuild devolvio ${jsResult.outputFiles.length} outputs, se esperaba 1`);
}
const bundleJs = jsResult.outputFiles[0].text;
if (bundleJs.indexOf('</script>') >= 0) {
  fail('el bundle contiene "</script>" y romperia el HTML inline');
}

// ── 4. Assets self-hosted (fuentes, marmol, logo) ─────────────────────────────
// Salen del mismo base64 que usa el PDF: una sola fuente de verdad para la estetica.
const assetsEntry = resolve(root, 'src/utils/pdf/pdf-assets.ts');
if (!existsSync(assetsEntry)) fail(`falta ${assetsEntry}`);

const assetsResult = await esbuild.build({
  entryPoints: [assetsEntry],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['es2020'],
  write: false,
  logLevel: 'warning',
});
const assetsModule = { exports: {} };
new Function('module', 'exports', assetsResult.outputFiles[0].text)(
  assetsModule,
  assetsModule.exports
);

const ASSET_MAP = [
  ['fonts/cinzel-regular.ttf', 'CINZEL_REGULAR_BASE64'],
  ['fonts/cinzel-bold.ttf', 'CINZEL_BOLD_BASE64'],
  ['fonts/nunito-regular.ttf', 'NUNITO_SANS_REGULAR_BASE64'],
  ['fonts/nunito-bold.ttf', 'NUNITO_SANS_BOLD_BASE64'],
  ['marble.jpg', 'MARBLE_BG_BASE64'],
  ['logo.png', 'LOGO_BASE64'],
];

mkdirSync(resolve(outDir, 'fonts'), { recursive: true });

let assetsWritten = 0;
for (const [file, exportName] of ASSET_MAP) {
  const value = assetsModule.exports[exportName];
  if (typeof value !== 'string' || value.length === 0) {
    fail(`pdf-assets.ts no exporta ${exportName} como string no vacio`);
  }
  // LOGO/MARBLE vienen con prefijo data URI; las fuentes, en base64 pelado.
  const marker = value.indexOf('base64,');
  const raw = marker >= 0 ? value.slice(marker + 'base64,'.length) : value;
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length === 0) fail(`${exportName} decodifico a 0 bytes`);
  if (writeIfChanged(resolve(outDir, file), bytes, assetsEntry)) assetsWritten++;
}
console.log(`${TAG} assets: ${assetsWritten} escritos, ${ASSET_MAP.length - assetsWritten} sin cambios`);

// ── 5. Vectores dorados del timer (los emite el test del API, plan 164-02) ─────
const vectorsSrc = resolve(root, '../el-templo-api/test/tv/__fixtures__/timer-vectors.json');
if (!existsSync(vectorsSrc)) {
  fail(
    `falta ${vectorsSrc}`,
    'lo produce el test del timer del API (plan 164-02). Sin el, /tv/?selftest=1 no puede correr en el televisor.'
  );
}
writeIfChanged(resolve(outDir, 'timer-vectors.json'), readFileSync(vectorsSrc), vectorsSrc);

// ── 6. Version del build (D-22) ───────────────────────────────────────────────
const styles = readRequired(resolve(srcDir, 'styles.css'), 'src/tv/styles.css').toString('utf8');
const template = readRequired(resolve(srcDir, 'index.html'), 'src/tv/index.html').toString('utf8');
if (styles.indexOf('</style>') >= 0) {
  fail('styles.css contiene "</style>" y romperia el HTML inline');
}

/**
 * Origen del API horneado en la pagina.
 *
 * El kiosco no pasa por Vite (esbuild a ES2015, D-24), asi que NO hereda
 * `import.meta.env.VITE_API_URL` como el resto del admin. Sin este valor el runtime cae
 * al host que sirve la pagina — y ese host es el vhost del admin, que sirve estaticos y
 * no proxea `/api`: el pairing come 405 y el televisor queda en "Conectando..." para
 * siempre. Paso en la verificacion en staging de la fase 164.
 *
 * Se saca el sufijo `/api` porque el kiosco arma las rutas completas (`/api/tv/...`),
 * mismo criterio que el smoke test de .github/workflows/deploy.yml.
 */
const apiBase = (process.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
if (apiBase.length === 0) {
  console.warn(
    `${TAG} sin VITE_API_URL: el kiosco va a pegarle al host que lo sirve. Anda en dev con ?api=, NO en la sede.`
  );
}

// La version entra al hash junto con la base: dos builds identicos salvo la URL del API
// tienen que dar versiones distintas, o los televisores ya vinculados nunca recargan (D-22).
const version = createHash('sha256')
  .update(bundleJs)
  .update(styles)
  .update(template)
  .update(apiBase)
  .digest('hex')
  .slice(0, 8);

// ── 7. index.html autocontenido ───────────────────────────────────────────────
const STYLE_MARK = '<!--__STYLE__-->';
const SCRIPT_MARK = '<!--__SCRIPT__-->';
if (template.indexOf(STYLE_MARK) < 0) fail(`src/tv/index.html no tiene ${STYLE_MARK}`);
if (template.indexOf(SCRIPT_MARK) < 0) fail(`src/tv/index.html no tiene ${SCRIPT_MARK}`);

const html = template
  .replace(STYLE_MARK, `<style>\n${styles}\n</style>`)
  .replace(
    SCRIPT_MARK,
    `<script>\nwindow.__TV_VERSION__ = ${JSON.stringify(version)};\nwindow.__TV_API_BASE__ = ${JSON.stringify(apiBase)};\n${bundleJs}\n</script>`
  );

writeIfChanged(resolve(outDir, 'index.html'), html);
writeIfChanged(resolve(outDir, 'version.txt'), version);

console.log(
  `${TAG} listo — public/tv/index.html ${(html.length / 1024).toFixed(1)} KB, version ${version}`
);
