import React from 'react';
import { Box, Text } from 'ink';
import type { Entry } from '../k8s/types.js';
import { SecretRow, type EditingField, type RowStatus } from './SecretRow.js';

interface SecretListProps {
  entries: Entry[];
  original: Entry[];
  selectedIndex: number;
  rows: number;
  width: number;
  focused: boolean;
  editingId: string | null;
  editingField: EditingField;
  onCommitName: (id: string, key: string) => void;
  onCommitValue: (id: string, value: string) => void;
  onCancelEdit: () => void;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function rowStatus(entry: Entry, originalByKey: Map<string, Entry>): RowStatus {
  if (entry.originalKey === null) return 'new';
  if (entry.key !== entry.originalKey) return 'renamed';
  const orig = originalByKey.get(entry.originalKey);
  if (!entry.binary && orig && orig.value !== entry.value) return 'changed';
  return 'unchanged';
}

/** The bottom region: a header and a windowed list of editable rows. */
export function SecretList({
  entries,
  original,
  selectedIndex,
  rows,
  width,
  focused,
  editingId,
  editingField,
  onCommitName,
  onCommitValue,
  onCancelEdit,
}: SecretListProps) {
  const nameWidth = clamp(Math.floor(width * 0.35), 8, 40);
  const valueWidth = Math.max(6, width - nameWidth - 6);
  const originalByKey = new Map(original.map((e) => [e.key, e] as const));

  const bodyRows = Math.max(1, rows);
  const start = clamp(selectedIndex - Math.floor(bodyRows / 2), 0, Math.max(0, entries.length - bodyRows));
  const visible = entries.slice(start, start + bodyRows);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box>
        <Text>{'   '}</Text>
        <Box width={nameWidth}>
          <Text bold underline>
            NAME
          </Text>
        </Box>
        <Text>{'   '}</Text>
        <Box width={valueWidth}>
          <Text bold underline>
            VALUE
          </Text>
        </Box>
      </Box>

      {entries.length === 0 ? (
        <Text dimColor>{'   '}(no entries — press “a” to add, or choose a secret above)</Text>
      ) : (
        visible.map((entry, i) => {
          const idx = start + i;
          return (
            <SecretRow
              key={entry.id}
              entry={entry}
              selected={focused && idx === selectedIndex}
              status={rowStatus(entry, originalByKey)}
              nameWidth={nameWidth}
              valueWidth={valueWidth}
              editing={editingId === entry.id ? editingField : null}
              onCommitName={onCommitName}
              onCommitValue={onCommitValue}
              onCancelEdit={onCancelEdit}
            />
          );
        })
      )}

      <Box>
        <Text dimColor>
          {entries.length > 0 ? `${selectedIndex + 1}/${entries.length}` : '0/0'}
          {start > 0 ? '  ↑ more' : ''}
          {start + bodyRows < entries.length ? '  ↓ more' : ''}
        </Text>
      </Box>
    </Box>
  );
}
