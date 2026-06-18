import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../state/store.js';

interface StatusBarProps {
  state: AppState;
  dirty: boolean;
  help: string;
}

const statusColor = (kind: 'info' | 'error' | 'success'): string =>
  kind === 'error' ? 'red' : kind === 'success' ? 'green' : 'gray';

/** Bottom bar: selection summary + dirty indicator, then a status or help line. */
export function StatusBar({ state, dirty, help }: StatusBarProps) {
  return (
    <Box flexDirection="column" width="100%">
      <Box>
        <Text>{state.loading ? '⏳ ' : ''}</Text>
        <Text color="cyan">ctx</Text>
        <Text> {state.currentContext ?? '—'} </Text>
        <Text color="cyan">ns</Text>
        <Text> {state.currentNamespace ?? '—'} </Text>
        <Text color="cyan">secret</Text>
        <Text> {state.currentSecret ?? '—'} </Text>
        {dirty ? <Text color="yellow">● unsaved</Text> : <Text dimColor>○ clean</Text>}
      </Box>
      {state.status ? (
        <Text color={statusColor(state.status.kind)} wrap="truncate-end">
          {state.status.text}
        </Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          {help}
        </Text>
      )}
    </Box>
  );
}
