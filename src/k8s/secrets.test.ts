import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMergePatch,
  cloneEntries,
  computeChanges,
  decodeSecretValue,
  entriesFromData,
  findDuplicateKeys,
  isDirty,
} from './secrets.js';
import type { Entry } from './types.js';

const b64 = (s: string): string => Buffer.from(s, 'utf-8').toString('base64');

test('decodeSecretValue decodes utf-8 and flags binary', () => {
  assert.deepEqual(decodeSecretValue(b64('hello')), { value: 'hello', binary: false });
  // 0xff 0xfe is not valid utf-8
  const bin = decodeSecretValue(Buffer.from([0xff, 0xfe]).toString('base64'));
  assert.equal(bin.binary, true);
});

test('entriesFromData sorts keys and snapshots originalKey', () => {
  const entries = entriesFromData({ B: b64('2'), A: b64('1') });
  assert.deepEqual(
    entries.map((e) => [e.key, e.value, e.originalKey]),
    [
      ['A', '1', 'A'],
      ['B', '2', 'B'],
    ],
  );
});

const snapshot = (): Entry[] => entriesFromData({ A: b64('1'), B: b64('2'), C: b64('3') });

test('computeChanges + isDirty detect add/remove/change/rename', () => {
  const original = snapshot();
  const working = cloneEntries(original);
  // change A
  working[0]!.value = 'one';
  // rename B -> BB
  working[1]!.key = 'BB';
  // remove C
  working.splice(2, 1);
  // add D
  working.push({ id: 'x', key: 'D', value: '4', originalKey: null, binary: false });

  assert.equal(isDirty(original, working), true);
  const kinds = computeChanges(original, working)
    .map((c) => c.kind)
    .sort();
  assert.deepEqual(kinds, ['added', 'changed', 'removed', 'renamed']);
});

test('buildMergePatch upserts changed keys and nulls deletions/renames', () => {
  const original = snapshot();
  const working = cloneEntries(original);
  working[0]!.value = 'one'; // change A
  working[1]!.key = 'BB'; // rename B -> BB
  working.splice(2, 1); // remove C
  working.push({ id: 'x', key: 'D', value: '4', originalKey: null, binary: false }); // add D

  const patch = buildMergePatch(original, working);
  assert.deepEqual(patch.stringData, { A: 'one', BB: '2', D: '4' });
  assert.deepEqual(patch.data, { B: null, C: null });
});

test('buildMergePatch is empty when nothing changed', () => {
  const original = snapshot();
  const patch = buildMergePatch(original, cloneEntries(original));
  assert.deepEqual(patch, {});
});

test('findDuplicateKeys reports collisions only', () => {
  assert.deepEqual(findDuplicateKeys(entriesFromData({ A: b64('1') })), []);
  const dupes = findDuplicateKeys([
    { id: '1', key: 'A', value: '', originalKey: 'A', binary: false },
    { id: '2', key: 'A', value: '', originalKey: null, binary: false },
  ]);
  assert.deepEqual(dupes, ['A']);
});
