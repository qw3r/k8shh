import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'smol-toml';

export interface AppConfig {
  /** Secret names ending with any of these suffixes are hidden from the picker. */
  excludeSuffixes: string[];
  /** Named theme: amber (default) | catppuccin-mocha | tokyo-night | nord | dracula */
  theme?: string;
}

/** Always hidden, regardless of config. */
const BUILTIN_EXCLUDE_SUFFIXES = ['-backup'];

const DEFAULT_CONFIG_TOML = `# k8shh configuration

# Theme: amber (default) | catppuccin-mocha | tokyo-night | nord | dracula
# theme = "amber"

[secrets]
# Secret names ending with any of these suffixes are hidden from the picker.
# "-backup" is always hidden; entries here are added to that list.
exclude_suffixes = []
`;

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'k8shh', 'config.toml');
}

/**
 * Load config from ~/.config/k8shh/config.toml. On first run (missing file) a
 * commented default is written so it's discoverable. Any read/parse error falls
 * back to built-in defaults.
 */
export function loadConfig(): AppConfig {
  const file = configPath();
  let userSuffixes: string[] = [];
  let theme: string | undefined;
  try {
    const data = parse(readFileSync(file, 'utf-8')) as {
      theme?: unknown;
      secrets?: { exclude_suffixes?: unknown };
    };
    const list = data.secrets?.exclude_suffixes;
    if (Array.isArray(list)) {
      userSuffixes = list.filter((x): x is string => typeof x === 'string' && x.length > 0);
    }
    if (typeof data.theme === 'string' && data.theme.length > 0) {
      theme = data.theme;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, DEFAULT_CONFIG_TOML, 'utf-8');
      } catch {
        /* best-effort seeding */
      }
    }
  }
  return { excludeSuffixes: [...new Set([...BUILTIN_EXCLUDE_SUFFIXES, ...userSuffixes])], theme };
}

/** Whether a secret name should be hidden per the configured suffixes. */
export function isSecretHidden(name: string, config: AppConfig): boolean {
  return config.excludeSuffixes.some((suffix) => name.endsWith(suffix));
}

/** Persist the theme name to config.toml, replacing or prepending the theme line. */
export function saveThemeName(name: string): void {
  const file = configPath();
  try {
    const existing = readFileSync(file, 'utf-8');
    const updated = /^#?\s*theme\s*=/m.test(existing)
      ? existing.replace(/^#?\s*theme\s*=.*$/m, `theme = "${name}"`)
      : `theme = "${name}"\n\n${existing}`;
    writeFileSync(file, updated, 'utf-8');
  } catch {
    /* best-effort */
  }
}
