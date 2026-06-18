import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { EntryChange } from '../k8s/types.js';

interface DiffConfirmModalProps {
  changes: EntryChange[];
  width: number;
  height: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function shorten(s: string, n: number): string {
  const oneLine = s.replace(/\n/g, '↵');
  const max = Math.max(4, Math.floor(n));
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function ChangeLine({ change, width }: { change: EntryChange; width: number }) {
  const w = Math.max(10, width - 16);
  switch (change.kind) {
    case 'added':
      return (
        <Text color="green" wrap="truncate-end">
          + {change.key} = {shorten(change.newValue, w)}
          {change.binary ? ' (binary)' : ''}
        </Text>
      );
    case 'removed':
      return (
        <Text color="red" wrap="truncate-end">
          - {change.key}
        </Text>
      );
    case 'changed':
      return (
        <Text color="yellow" wrap="truncate-end">
          ~ {change.key}: {shorten(change.oldValue, w / 2)} → {shorten(change.newValue, w / 2)}
        </Text>
      );
    case 'renamed':
      return (
        <Text color="cyan" wrap="truncate-end">
          » {change.oldKey} → {change.key}
          {change.valueChanged ? ' (value changed)' : ''}
        </Text>
      );
    default:
      return null;
  }
}

/** Shows the pending changes and asks the user to confirm before patching. */
export function DiffConfirmModal({ changes, width, height, onConfirm, onCancel }: DiffConfirmModalProps) {
  useInput((input, key) => {
    if (key.escape || input === 'n') return onCancel();
    if (key.return || input === 'y') {
      if (changes.length > 0) onConfirm();
      else onCancel();
    }
  });

  const bodyHeight = Math.max(1, height - 4);
  const shown = changes.slice(0, bodyHeight);
  const overflow = changes.length - shown.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      width="100%"
      height={height}
    >
      <Text bold color="yellow">
        Review changes to apply ({changes.length})
      </Text>
      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {changes.length === 0 ? (
          <Text dimColor>No changes to save.</Text>
        ) : (
          <>
            {shown.map((change, i) => (
              <ChangeLine key={i} change={change} width={width} />
            ))}
            {overflow > 0 ? <Text dimColor>…and {overflow} more</Text> : null}
          </>
        )}
      </Box>
      <Text dimColor>
        {changes.length > 0 ? 'Patch only these keys?  y/Enter confirm · n/Esc cancel' : 'Esc to close'}
      </Text>
    </Box>
  );
}
