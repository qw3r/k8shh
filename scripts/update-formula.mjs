import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = (process.env.K8SHH_VERSION || process.argv[2] || pkg.version).replace(/^v/, '');

function detectRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root }).toString().trim();
    const m = url.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (m) return m[1];
  } catch {
    /* no remote configured */
  }
  return 'OWNER/REPO';
}

const repo = process.env.REPO || process.argv[3] || detectRepo();

let sha = process.env.SHA256 || process.argv[4];
if (!sha) {
  const shaFile = resolve(root, 'dist', `k8shh-${version}.tar.gz.sha256`);
  if (existsSync(shaFile)) sha = readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
}
if (!sha) {
  console.error('No sha256 available — build the release first or pass it as the 3rd argument.');
  process.exit(1);
}

const url = `https://github.com/${repo}/releases/download/v${version}/k8shh-${version}.tar.gz`;

const formula = `class K8shh < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/${repo}"
  url "${url}"
  sha256 "${sha}"
  license "MIT"
  version "${version}"

  depends_on "node"

  def install
    # The release ships a single self-contained bundle; only Node is required.
    libexec.install "k8shh.mjs"
    (bin/"k8shh").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/k8shh.mjs" "$@"
    SH
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/k8shh --version")
  end
end
`;

const dir = resolve(root, 'Formula');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'k8shh.rb'), formula);
console.log(`Wrote Formula/k8shh.rb (version=${version}, repo=${repo})`);
