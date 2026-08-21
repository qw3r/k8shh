import React from 'react';
import { Box, Text } from 'ink';
import type { AppState, Mode } from '../state/store.js';
import { theme } from '../theme.js';

interface StatusBarProps {
  state: AppState;
  dirty: boolean;
  help: string;
}

const statusColor = (kind: 'info' | 'error' | 'success'): string =>
  kind === 'error' ? theme.error : kind === 'success' ? theme.success : 'gray';

/** vim-style mode word shown in the accent block on the left. */
const modeLabel = (kind: Mode['kind']): string =>
  ({
    browse: 'NORMAL',
    filter: 'FILTER',
    select: 'SELECT',
    editName: 'EDIT',
    editValue: 'EDIT',
    valueModal: 'VALUE',
    confirmSave: 'CONFIRM',
    confirmDiscard: 'CONFIRM',
    authError: 'AUTH',
    restartProgress: 'RESTART',
    themeSelect: 'THEME',
  })[kind] ?? 'NORMAL';

/** Keys that mutate: save persists to the cluster; delete/reset discard data. */
const keyColor = (key: string): string =>
  key === 's' ? theme.success : key === 'd' || key === 'x' ? theme.error : theme.accent;

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

/** Bottom bar: mode block + secret + dirty indicator, then a status or help line. */
export function StatusBar({ state, dirty, help }: StatusBarProps) {
  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text bold color={theme.on} backgroundColor={theme.accent}>
            {` ${modeLabel(state.mode.kind)} `}
          </Text>
          <Text> {state.currentSecret ?? '—'}</Text>
        </Box>
        {dirty ? <Text color={theme.warn}>● unsaved</Text> : <Text color={theme.muted}>○ clean</Text>}
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
