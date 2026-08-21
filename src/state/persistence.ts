import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** The remembered selection, restored on the next launch. */
export interface LastSelection {
  context?: string;
  namespace?: string;
  secret?: string;
  /** Per-context memory: context name → { namespace, secret } */
  perContext?: Record<string, { namespace: string; secret: string }>;
}

function stateFilePath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'k8shh', 'last-selection.json');
}

/** Read the remembered selection, or null if absent/unreadable. */
export function loadLastSelection(): LastSelection | null {
  try {
    const parsed = JSON.parse(readFileSync(stateFilePath(), 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as LastSelection;
    return null;
  } catch {
    return null;
  }
}

/** Persist the selection. Also updates the per-context map. */
export function saveLastSelection(selection: LastSelection): void {
  try {
    const file = stateFilePath();
    mkdirSync(dirname(file), { recursive: true });
    const existing = loadLastSelection() ?? {};
    const perContext = { ...(existing.perContext ?? {}) };
    if (selection.context && selection.namespace && selection.secret) {
      perContext[selection.context] = { namespace: selection.namespace, secret: selection.secret };
    }
    writeFileSync(file, `${JSON.stringify({ ...selection, perContext }, null, 2)}\n`, 'utf-8');
  } catch {
    // best-effort only
  }
}

/** Return the remembered namespace+secret for a specific context, or null. */
export function getPerContextSelection(context: string): { namespace: string; secret: string } | null {
  const last = loadLastSelection();
  return last?.perContext?.[context] ?? null;
}
