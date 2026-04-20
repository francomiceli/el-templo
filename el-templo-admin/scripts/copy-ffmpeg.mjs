import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/umd');
const dest = resolve(root, 'public/ffmpeg');

if (!existsSync(src)) {
  console.error(`[copy-ffmpeg] source missing: ${src}`);
  console.error('[copy-ffmpeg] run pnpm install first');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(resolve(src, file), resolve(dest, file));
  console.log(`[copy-ffmpeg] copied ${file}`);
}
