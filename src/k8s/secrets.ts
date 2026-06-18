import type { Entry, EntryChange, MergePatchBody } from './types.js';

let idCounter = 0;

/** Generate a process-unique entry id (used for React keys and selection). */
export function newEntryId(): string {
  idCounter += 1;
  return `e_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * Decode a base64 Secret value. Values that are not valid UTF-8 (or contain a
 * NUL byte) are reported as binary and shown read-only so we never corrupt them.
 */
export function decodeSecretValue(base64: string): { value: string; binary: boolean } {
  const buf = Buffer.from(base64, 'base64');
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    if (value.includes('\u0000')) {
      return { value: `<binary: ${buf.length} bytes>`, binary: true };
    }
    return { value, binary: false };
  } catch {
    return { value: `<binary: ${buf.length} bytes>`, binary: true };
  }
}

/** Map a Secret's `data` map into sorted, editable entries. */
export function entriesFromData(data: Record<string, string | undefined>): Entry[] {
  return Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const { value, binary } = decodeSecretValue(data[key] ?? '');
      return { id: newEntryId(), key, value, originalKey: key, binary };
    });
}

/** Deep-ish clone of entries for an independent working copy. */
export function cloneEntries(entries: Entry[]): Entry[] {
  return entries.map((e) => ({ ...e }));
}

/** A blank, editable entry ready for the user to fill in. */
export function blankEntry(): Entry {
  return { id: newEntryId(), key: '', value: '', originalKey: null, binary: false };
}

/**
 * Whether the working copy differs from the pristine snapshot.
 * Binary entries can only be added/removed/renamed, never value-edited.
 */
export function isDirty(original: Entry[], working: Entry[]): boolean {
  return computeChanges(original, working).length > 0;
}

/** Compute a human-readable list of changes between snapshot and working copy. */
export function computeChanges(original: Entry[], working: Entry[]): EntryChange[] {
  const originalByKey = new Map(original.map((e) => [e.key, e]));
  const survivingOriginalKeys = new Set<string>();
  const changes: EntryChange[] = [];

  for (const w of working) {
    if (w.originalKey === null) {
      changes.push({ kind: 'added', key: w.key, newValue: w.value, binary: w.binary });
      continue;
    }
    survivingOriginalKeys.add(w.originalKey);
    const orig = originalByKey.get(w.originalKey);
    const oldValue = orig?.value ?? '';
    const renamed = w.originalKey !== w.key;
    // Binary values cannot change in-place; only a rename is meaningful.
    const valueChanged = !w.binary && oldValue !== w.value;
    if (renamed) {
      changes.push({
        kind: 'renamed',
        oldKey: w.originalKey,
        key: w.key,
        valueChanged,
        oldValue,
        newValue: w.value,
      });
    } else if (valueChanged) {
      changes.push({ kind: 'changed', key: w.key, oldValue, newValue: w.value });
    }
  }

  for (const o of original) {
    if (!survivingOriginalKeys.has(o.key)) {
      changes.push({ kind: 'removed', key: o.key });
    }
  }

  return changes;
}

/**
 * Build a JSON merge patch that touches only changed keys:
 *  - upserts (added / renamed-target / value-changed) go in `stringData`
 *  - deletions (removed / renamed-source) go in `data` as `null`
 * Binary entries are never re-sent, so they are preserved untouched.
 */
export function buildMergePatch(original: Entry[], working: Entry[]): MergePatchBody {
  const stringData: Record<string, string> = {};
  const data: Record<string, string | null> = {};
  const originalByKey = new Map(original.map((e) => [e.key, e]));
  const survivingOriginalKeys = new Set<string>();

  for (const w of working) {
    if (w.originalKey !== null) {
      survivingOriginalKeys.add(w.originalKey);
    }
    if (w.binary) {
      // Cannot safely re-encode binary; only honor a rename by moving the key.
      if (w.originalKey !== null && w.originalKey !== w.key) {
        data[w.originalKey] = null;
        // Note: re-creating the binary value under the new key is out of scope;
        // the UI disallows renaming binary entries, so this branch is defensive.
      }
      continue;
    }
    const isNew = w.originalKey === null;
    const renamed = !isNew && w.originalKey !== w.key;
    const oldValue = isNew ? undefined : originalByKey.get(w.originalKey as string)?.value;
    const changed = isNew || renamed || oldValue !== w.value;
    if (changed) {
      stringData[w.key] = w.value;
    }
    if (renamed && w.originalKey !== null) {
      data[w.originalKey] = null;
    }
  }

  for (const o of original) {
    if (!survivingOriginalKeys.has(o.key)) {
      data[o.key] = null;
    }
  }

  const patch: MergePatchBody = {};
  if (Object.keys(stringData).length > 0) patch.stringData = stringData;
  if (Object.keys(data).length > 0) patch.data = data;
  return patch;
}

/** Find duplicate keys in the working copy (empty array means valid). */
export function findDuplicateKeys(working: Entry[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const e of working) {
    const k = e.key.trim();
    if (k === '') continue;
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  return [...dupes];
}
