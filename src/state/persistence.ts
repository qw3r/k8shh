import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** The remembered selection, restored on the next launch. */
export interface LastSelection {
  context?: string;
  namespace?: string;
  secret?: string;
}

function stateFilePath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return join(base, 'gap-cli-secrets', 'last-selection.json');
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

/** Persist the selection (best-effort; persistence errors are ignored). */
export function saveLastSelection(selection: LastSelection): void {
  try {
    const file = stateFilePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(selection, null, 2)}\n`, 'utf-8');
  } catch {
    // best-effort only
  }
}
