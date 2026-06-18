import React from 'react';
import { Box, Text } from 'ink';
import { type AppState, TOOLBAR_CONTROLS, type ToolbarControl } from '../state/store.js';

interface ToolbarProps {
  state: AppState;
  dirty: boolean;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

function Chip({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <Box marginRight={1}>
      <Text inverse={active}>
        <Text color={active ? undefined : 'cyan'}>{label}:</Text> {value}
      </Text>
    </Box>
  );
}

function Button({ label, active, color }: { label: string; active: boolean; color?: string }) {
  return (
    <Box marginLeft={1}>
      <Text inverse={active} color={color}>{`[ ${label} ]`}</Text>
    </Box>
  );
}

/** Top region: three selectors on the left, action buttons on the right. */
export function Toolbar({ state, dirty }: ToolbarProps) {
  const inToolbar = state.focusZone === 'toolbar';
  const active = (name: ToolbarControl): boolean =>
    inToolbar && TOOLBAR_CONTROLS[state.toolbarIndex] === name;

  return (
    <Box
      borderStyle="round"
      borderColor={inToolbar ? 'cyan' : 'gray'}
      paddingX={1}
      width="100%"
      justifyContent="space-between"
    >
      <Box>
        <Chip label="context" value={truncate(state.currentContext ?? '—', 22)} active={active('context')} />
        <Chip
          label="namespace"
          value={truncate(state.currentNamespace ?? '—', 18)}
          active={active('namespace')}
        />
        <Chip label="secret" value={truncate(state.currentSecret ?? '—', 22)} active={active('secret')} />
      </Box>
      <Box>
        <Button label="Reload" active={active('reload')} />
        <Button label="Reset" active={active('reset')} />
        <Button
          label={dirty ? 'Save*' : 'Save'}
          active={active('save')}
          color={dirty ? 'yellow' : undefined}
        />
      </Box>
    </Box>
  );
}
