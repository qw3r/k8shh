import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = (process.env.K8SHH_VERSION || process.argv[2] || pkg.version).replace(/^v/, '');

const dist = resolve(root, 'dist');
const bundle = resolve(dist, 'k8shh.mjs');
if (!existsSync(bundle)) {
  console.error('Bundle not found at dist/k8shh.mjs — run `npm run build:bundle` first.');
  process.exit(1);
}

// Stage the self-contained bundle plus docs/license into a versioned dir.
const stageName = `k8shh-${version}`;
const pkgRoot = resolve(dist, 'pkg');
const stageDir = resolve(pkgRoot, stageName);
rmSync(pkgRoot, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
cpSync(bundle, resolve(stageDir, 'k8shh.mjs'));
for (const file of ['README.md', 'LICENSE']) {
  const src = resolve(root, file);
  if (existsSync(src)) cpSync(src, resolve(stageDir, file));
}

// tar is available on macOS (bsdtar) and Linux (GNU tar) runners.
const tarball = resolve(dist, `${stageName}.tar.gz`);
execFileSync('tar', ['-czf', tarball, '-C', pkgRoot, stageName], { stdio: 'inherit' });

const sha = createHash('sha256').update(readFileSync(tarball)).digest('hex');
writeFileSync(`${tarball}.sha256`, `${sha}  ${stageName}.tar.gz\n`);

console.log(`version=${version}`);
console.log(`tarball=${tarball}`);
console.log(`sha256=${sha}`);
