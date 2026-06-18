import React from 'react';
import { Box, Text } from 'ink';
import type { Entry } from '../k8s/types.js';
import { isJson } from '../util/json.js';
import { TextField } from './TextField.js';

export type RowStatus = 'new' | 'renamed' | 'changed' | 'unchanged';
export type EditingField = 'name' | 'value' | null;

interface SecretRowProps {
  entry: Entry;
  selected: boolean;
  status: RowStatus;
  nameWidth: number;
  valueWidth: number;
  editing: EditingField;
  onCommitName: (id: string, key: string) => void;
  onCommitValue: (id: string, value: string) => void;
  onCancelEdit: () => void;
}

function marker(status: RowStatus): { ch: string; color?: string } {
  switch (status) {
    case 'new':
      return { ch: '+', color: 'green' };
    case 'renamed':
      return { ch: '»', color: 'cyan' };
    case 'changed':
      return { ch: '~', color: 'yellow' };
    default:
      return { ch: ' ' };
  }
}

function ValuePreview({ entry }: { entry: Entry }) {
  if (entry.binary) {
    return (
      <Text dimColor wrap="truncate-end">
        {entry.value}
      </Text>
    );
  }
  const oneLine = entry.value.replace(/\n/g, '↵');
  return (
    <Text wrap="truncate-end">
      {isJson(entry.value) ? <Text color="magenta">{'{} '}</Text> : null}
      {oneLine.length > 0 ? oneLine : <Text dimColor>(empty)</Text>}
    </Text>
  );
}

/** One `NAME = VALUE` row; renders an inline editor when this row is being edited. */
export function SecretRow({
  entry,
  selected,
  status,
  nameWidth,
  valueWidth,
  editing,
  onCommitName,
  onCommitValue,
  onCancelEdit,
}: SecretRowProps) {
  const m = marker(status);
  return (
    <Box>
      <Text color={selected ? 'cyan' : undefined}>{selected ? '›' : ' '}</Text>
      <Text color={m.color}>{m.ch} </Text>
      <Box width={nameWidth}>
        {editing === 'name' ? (
          <TextField
            initialValue={entry.key}
            onSubmit={(v) => onCommitName(entry.id, v)}
            onCancel={onCancelEdit}
          />
        ) : (
          <Text bold={selected} color={entry.key.trim() === '' ? 'red' : undefined} wrap="truncate-end">
            {entry.key.trim() === '' ? '(unnamed)' : entry.key}
          </Text>
        )}
      </Box>
      <Text dimColor> = </Text>
      <Box width={valueWidth}>
        {editing === 'value' ? (
          <TextField
            initialValue={entry.value}
            onSubmit={(v) => onCommitValue(entry.id, v)}
            onCancel={onCancelEdit}
          />
        ) : (
          <ValuePreview entry={entry} />
        )}
      </Box>
    </Box>
  );
}
