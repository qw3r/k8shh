import React from 'react';
import { Box, Text } from 'ink';
import { type AppState, TOOLBAR_CONTROLS, type ToolbarControl } from '../state/store.js';
import { theme } from '../theme.js';
import { VERSION } from '../version.js';

interface ToolbarProps {
  state: AppState;
  dirty: boolean;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

/** Breadcrumb selector: filled accent bg when active, muted label + bold value otherwise. */
function Chip({ label, value, active }: { label: string; value: string; active: boolean }) {
  if (active) {
    return (
      <Text bold color={theme.on} backgroundColor={theme.accent}>
        {` ${label} ${value} `}
      </Text>
    );
  }
  return (
    <Text>
      <Text color={theme.muted}>{label} </Text>
      <Text bold>{value}</Text>
    </Text>
  );
}

/** Action button: filled accent bg when active, muted+dim when disabled. */
function Button({
  label,
  active,
  color,
  disabled = false,
}: {
  label: string;
  active: boolean;
  color?: string;
  disabled?: boolean;
}) {
  if (active) {
    return (
      <Box marginLeft={2}>
        <Text bold color={theme.on} backgroundColor={theme.accent}>{` ${label} `}</Text>
      </Box>
    );
  }
  return (
    <Box marginLeft={2}>
      <Text color={color} dimColor={disabled}>{label}</Text>
    </Box>
  );
}

/** Top bar: centered branding row + breadcrumb/action row. */
export function Toolbar({ state, dirty }: ToolbarProps) {
  const inToolbar = state.focusZone === 'toolbar';
  const active = (name: ToolbarControl): boolean =>
    inToolbar && TOOLBAR_CONTROLS[state.toolbarIndex] === name;

  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      <Box justifyContent="center">
        <Text bold color={theme.accent}>k8shh </Text>
        <Text color={theme.muted}>{VERSION}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Box gap={1}>
          <Chip label="ctx" value={truncate(state.currentContext ?? '—', 20)} active={active('context')} />
          <Text color={theme.muted}>·</Text>
          <Chip label="ns" value={truncate(state.currentNamespace ?? '—', 16)} active={active('namespace')} />
          <Text color={theme.muted}>·</Text>
          <Chip label="secret" value={truncate(state.currentSecret ?? '—', 20)} active={active('secret')} />
        </Box>
        <Box>
          <Button label="reload" active={active('reload')} />
          <Button label="reset" active={active('reset')} />
          <Button
            label={dirty ? 'save*' : 'save'}
            active={active('save')}
            color={dirty ? theme.warn : undefined}
            disabled={!dirty}
          />
          <Button label="restart" active={active('restart')} disabled={!state.currentSecret} />
        </Box>
      </Box>
    </Box>
  );
}
