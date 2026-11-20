// content script는 ESM import를 쓸 수 없으므로 엔트리마다 단일 IIFE 파일로 번들한다.
import { copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = fileURLToPath(new URL('./dist/', import.meta.url));

const entries = [
  { entry: 'src/content.ts', fileName: 'content.js' },
  { entry: 'src/service-worker.ts', fileName: 'service-worker.js' },
  // MAIN world 브리지. content script(ISOLATED)보다 먼저 주입한다(FR-1).
  { entry: 'src/page-bridge.ts', fileName: 'page-bridge.js' },
];

await rm(outDir, { recursive: true, force: true });

for (const { entry, fileName } of entries) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      lib: {
        entry,
        // iife 필수 옵션. 엔트리에 export가 없으므로 전역 변수는 생기지 않는다.
        name: 'DOMirror',
        formats: ['iife'],
        fileName: () => fileName,
      },
    },
  });
}

await copyFile(new URL('./manifest.json', import.meta.url), new URL('./dist/manifest.json', import.meta.url));
console.log(`[domirror] extension built → ${outDir}`);
