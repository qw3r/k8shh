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

/** Keys that mutate: save persists to the cluster; delete/reset discard data. */
const keyColor = (key: string): string =>
  key === 's' ? 'green' : key === 'd' || key === 'x' ? 'red' : 'cyan';

/** Render a ` · `-separated help string with keys highlighted, labels dim. */
function HelpLine({ help }: { help: string }) {
  return (
    <Text wrap="truncate-end">
      {help.split(' · ').map((part, i) => {
        const sp = part.indexOf(' ');
        const key = sp === -1 ? part : part.slice(0, sp);
        const label = sp === -1 ? '' : part.slice(sp);
        return (
          <React.Fragment key={i}>
            {i > 0 ? <Text dimColor> · </Text> : null}
            <Text bold color={keyColor(key)}>
              {key}
            </Text>
            <Text dimColor>{label}</Text>
          </React.Fragment>
        );
      })}
    </Text>
  );
}

/** Bottom bar: selection summary + dirty indicator, then a status or help line. */
export function StatusBar({ state, dirty, help }: StatusBarProps) {
  return (
    <Box flexDirection="column" width="100%" borderStyle="round" borderColor="gray" paddingX={1}>
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
        <HelpLine help={help} />
      )}
    </Box>
  );
}
