import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
// CI can override the embedded version (e.g. from the git tag) via K8SHH_VERSION.
const version = process.env.K8SHH_VERSION?.replace(/^v/, '') || pkg.version;

// Bundle the whole CLI (incl. Ink, React, Yoga's embedded WASM, and the k8s
// client) into one ESM file. ESM is required because Ink's reconciler uses
// top-level await. The entry's shebang is preserved automatically.
await build({
  entryPoints: [resolve(root, 'src/cli.tsx')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  outfile: resolve(root, 'dist/k8shh.mjs'),
  define: { __K8SHH_VERSION__: JSON.stringify(version) },
  // Ink pulls in react-devtools-core only under DEV=true; stub it out so the
  // bundle has zero runtime dependencies beyond Node itself.
  alias: { 'react-devtools-core': resolve(root, 'scripts/devtools-stub.mjs') },
  // The shebang makes the output directly executable. createRequire gives
  // bundled CommonJS deps a working `require` for Node built-ins (assert, etc.)
  // under the ESM output format.
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __cr } from 'node:module';",
      'const require = __cr(import.meta.url);',
    ].join('\n'),
  },
});

console.log('Bundled dist/k8shh.mjs');
